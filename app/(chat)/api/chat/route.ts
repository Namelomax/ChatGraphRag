import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  streamText,
} from "ai";
import { checkBotId } from "botid/server";
import { auth, type UserType } from "@/app/(auth)/auth";
import { entitlementsByUserType } from "@/lib/ai/entitlements";
import {
  allowedModelIds,
  chatModels,
  DEFAULT_CHAT_MODEL,
  getCapabilities,
} from "@/lib/ai/models";
import { type RequestHints, systemPrompt } from "@/lib/ai/prompts";
import { getLanguageModel } from "@/lib/ai/providers";
import { createDocument } from "@/lib/ai/tools/create-document";
import { editDocument } from "@/lib/ai/tools/edit-document";
import { requestSuggestions } from "@/lib/ai/tools/request-suggestions";
import { updateDocument } from "@/lib/ai/tools/update-document";
import { isProductionEnvironment } from "@/lib/constants";
import {
  deleteChatById,
  getChatById,
  getMessageCountByUserId,
  getMessagesByChatId,
  saveChat,
  saveMessages,
  updateChatTitleById,
  updateMessage,
} from "@/lib/db/queries";
import type { DBMessage } from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import { retrieveRagContextWithGraph } from "@/lib/rag/service";
import { generateRagQuery } from "@/lib/rag/query-generator";
import type { ChatMessage } from "@/lib/types";
import { convertToUIMessages, generateUUID } from "@/lib/utils";
import { generateTitleFromUserMessage } from "../../actions";
import { type PostRequestBody, postRequestBodySchema } from "./schema";

export const maxDuration = 60;

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    console.log("Request JSON:", json);
    requestBody = postRequestBodySchema.parse(json);
    console.log("Parsed requestBody:", requestBody);
  } catch (error) {
    console.error("Failed to parse request body:", error);
    return new ChatbotError("bad_request:api").toResponse();
  }

  try {
    const { id, message, messages, selectedChatModel, selectedVisibilityType, attachedFileTexts } =
      requestBody;

    const [, session] = await Promise.all([
      checkBotId().catch(() => null),
      auth(),
    ]);

    if (!session?.user) {
      console.error("No session or user found:", session);
      return new ChatbotError("unauthorized:chat").toResponse();
    }

    const chatModel = allowedModelIds.has(selectedChatModel)
      ? selectedChatModel
      : DEFAULT_CHAT_MODEL;

    const userType: UserType = session.user.type;

    const messageCount = await getMessageCountByUserId({
      id: session.user.id,
      differenceInHours: 1,
    });

    if (messageCount > entitlementsByUserType[userType].maxMessagesPerHour) {
      return new ChatbotError("rate_limit:chat").toResponse();
    }

    const isToolApprovalFlow = Boolean(messages);

    const chat = await getChatById({ id });
    let messagesFromDb: DBMessage[] = [];
    let titlePromise: Promise<string> | null = null;

    if (chat) {
      if (chat.userId !== session.user.id) {
        return new ChatbotError("forbidden:chat").toResponse();
      }
      messagesFromDb = await getMessagesByChatId({ id });
    } else if (message?.role === "user") {
      await saveChat({
        id,
        userId: session.user.id,
        title: "New chat",
        visibility: selectedVisibilityType,
      });
      titlePromise = generateTitleFromUserMessage({ message });
    }

    let uiMessages: ChatMessage[];

    if (isToolApprovalFlow && messages) {
      const dbMessages = convertToUIMessages(messagesFromDb);
      const approvalStates = new Map(
        messages.flatMap(
          (m) =>
            m.parts
              ?.filter(
                (p: Record<string, unknown>) =>
                  p.state === "approval-responded" ||
                  p.state === "output-denied"
              )
              .map((p: Record<string, unknown>) => [
                String(p.toolCallId ?? ""),
                p,
              ]) ?? []
        )
      );
      uiMessages = dbMessages.map((msg) => ({
        ...msg,
        parts: msg.parts.map((part) => {
          if (
            "toolCallId" in part &&
            approvalStates.has(String(part.toolCallId))
          ) {
            return { ...part, ...approvalStates.get(String(part.toolCallId)) };
          }
          return part;
        }),
      })) as ChatMessage[];
    } else {
      // Filter out non-image file parts from the incoming message
      // (AI SDK only supports images; documents are handled via RAG separately)
      const filteredMessage = message
        ? {
            ...message,
            parts: message.parts?.filter(
              (part) =>
                part.type === "text" ||
                (part.type === "file" &&
                  (part.mediaType?.startsWith("image/") ||
                    part.mediaType?.startsWith("video/")))
            ),
          }
        : undefined;

      uiMessages = [
        ...convertToUIMessages(messagesFromDb),
        filteredMessage as ChatMessage,
      ];
    }

    const requestHints: RequestHints = {
      longitude: undefined,
      latitude: undefined,
      city: undefined,
      country: undefined,
    };

    if (message?.role === "user") {
      // Save original message with file parts to DB
      await saveMessages({
        messages: [
          {
            chatId: id,
            id: message.id,
            role: "user",
            parts: message.parts,
            attachments: [],
            userId: session.user.id,
            createdAt: new Date(),
          },
        ],
      });
    }

    const modelConfig = chatModels.find((m) => m.id === chatModel);
    const modelCapabilities = await getCapabilities();
    const capabilities = modelCapabilities[chatModel];
    const isReasoningModel = capabilities?.reasoning === true;
    const supportsTools = capabilities?.tools === true;

    // Filter out non-image file parts from ALL uiMessages before converting
    const filteredUiMessages = uiMessages.map((msg) => ({
      ...msg,
      parts: msg.parts?.filter(
        (part) =>
          part.type === "text" ||
          part.type === "reasoning" ||
          (part.type === "file" &&
            ((part as any).mediaType?.startsWith("image/") ||
              (part as any).mediaType?.startsWith("video/")))
      ),
    })) as ChatMessage[];

    const modelMessages = await convertToModelMessages(filteredUiMessages);

    // Extract latest user text for RAG query generation
    const latestUserText =
      message?.parts
        ?.filter((part) => part.type === "text")
        .map((part) => ("text" in part ? part.text : ""))
        .join("\n")
        .trim() ?? "";

    // Build chat history context for RAG query generation
    const chatHistoryText = messagesFromDb
      .slice(-5)
      .map((m) => `${m.role}: ${JSON.stringify(m.parts)}`)
      .join("\n");

    // Use AI agent to generate a smart RAG query based on context
    const ragQuery = await generateRagQuery({
      userMessage: latestUserText,
      chatHistory: chatHistoryText,
    }).catch(() => "участники повестка решения встреча");

    // Retrieve RAG context - the AI will use this as its knowledge base
    const ragContext =
      await retrieveRagContextWithGraph({
        chatId: id,
        userId: session.user.id,
        query: ragQuery,
        topK: 10,
        useGraphEnhancement: true,
        useReranking: false, // LLM reranking слишком медленный (30-120s на chunk)
      }).catch((err) => {
        console.error("RAG retrieval error:", err);
        return "";
      }) ?? "";

    if (ragContext) {
      console.log("=== RAG RETRIEVAL ===");
      console.log("RAG Query:", ragQuery);
      console.log("RAG Context length:", ragContext.length, "chars");
      console.log("RAG Context preview:", ragContext.substring(0, 500));
      console.log("=====================");
    } else {
      console.log("=== RAG: No context found (query:", ragQuery, ") ===");
    }

    // Combine RAG context with attached file texts
    const attachedTexts = (attachedFileTexts as string[] | undefined) ?? [];
    const fullContext = [
      ragContext,
      ...attachedTexts.filter(Boolean),
    ].join("\n\n---\n\n");

    console.log(`[Context] RAG: ${ragContext.length} chars, Attached texts: ${attachedTexts.length} items, Total: ${fullContext.length} chars`);

    const stream = createUIMessageStream({
      originalMessages: isToolApprovalFlow ? uiMessages : undefined,
      execute: async ({ writer: dataStream }) => {
        const result = streamText({
          model: getLanguageModel(chatModel),
          system: systemPrompt({ requestHints, supportsTools, ragContext: fullContext || undefined }),
          messages: modelMessages,
          maxRetries: 1,
          experimental_activeTools:
            isReasoningModel && !supportsTools
              ? []
              : [
                  "createDocument",
                  "editDocument",
                  "updateDocument",
                  "requestSuggestions",
                ],
          providerOptions: {
            ...(modelConfig?.gatewayOrder && {
              gateway: { order: modelConfig.gatewayOrder },
            }),
            ...(modelConfig?.reasoningEffort && {
              openai: { reasoningEffort: modelConfig.reasoningEffort },
            }),
          },
          tools: {
            createDocument: createDocument({
              session,
              dataStream,
              modelId: chatModel,
              ragContext: fullContext || undefined,
              chatMessages: uiMessages,
            }),
            editDocument: editDocument({ dataStream, session }),
            updateDocument: updateDocument({
              session,
              dataStream,
              modelId: chatModel,
            }),
            requestSuggestions: requestSuggestions({
              session,
              dataStream,
              modelId: chatModel,
            }),
          },
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: "stream-text",
          },
        });

        dataStream.merge(
          result.toUIMessageStream({ sendReasoning: isReasoningModel })
        );

        if (titlePromise) {
          const title = await titlePromise;
          dataStream.write({ type: "data-chat-title", data: title });
          updateChatTitleById({ chatId: id, title });
        }
      },
      generateId: generateUUID,
      onFinish: async ({ messages: finishedMessages }) => {
        if (isToolApprovalFlow) {
          for (const finishedMsg of finishedMessages) {
            const existingMsg = uiMessages.find((m) => m.id === finishedMsg.id);
            if (existingMsg) {
              await updateMessage({
                id: finishedMsg.id,
                parts: finishedMsg.parts,
              });
            } else {
              await saveMessages({
                messages: [
                  {
                    id: finishedMsg.id,
                    role: finishedMsg.role,
                    parts: finishedMsg.parts,
                    createdAt: new Date(),
                    attachments: [],
                    userId: session.user.id,
                    chatId: id,
                  },
                ],
              });
            }
          }
        } else if (finishedMessages.length > 0) {
          await saveMessages({
            messages: finishedMessages.map((currentMessage) => ({
              id: currentMessage.id,
              role: currentMessage.role,
              parts: currentMessage.parts,
              createdAt: new Date(),
              attachments: [],
              userId: session.user.id,
              chatId: id,
            })),
          });
        }
      },
      onError: (error) => {
        if (
          error instanceof Error &&
          error.message?.includes(
            "AI Gateway requires a valid credit card on file to service requests"
          )
        ) {
          return "AI Gateway requires a valid credit card on file to service requests. Please visit https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%3Fmodal%3Dadd-credit-card to add a card and unlock your free credits.";
        }
        return "Oops, an error occurred!";
      },
    });

    return createUIMessageStreamResponse({
      stream,
    });
  } catch (error) {
    const vercelId = request.headers.get("x-vercel-id");

    if (error instanceof ChatbotError) {
      return error.toResponse();
    }

    if (
      error instanceof Error &&
      error.message?.includes(
        "AI Gateway requires a valid credit card on file to service requests"
      )
    ) {
      return new ChatbotError("bad_request:activate_gateway").toResponse();
    }

    // Log full error details for debugging
    console.error("Unhandled error in chat API:", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      cause: error instanceof Error ? error.cause : undefined,
      vercelId,
    });

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return Response.json(
      {
        code: "offline:chat",
        message: errorMessage,
        cause: "Check server logs for details",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatbotError("bad_request:api").toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const chat = await getChatById({ id });

  if (chat?.userId !== session.user.id) {
    return new ChatbotError("forbidden:chat").toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}
