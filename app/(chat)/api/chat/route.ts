import { geolocation, ipAddress } from "@vercel/functions";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  generateText,
  stepCountIs,
  streamText,
} from "ai";
import { checkBotId } from "botid/server";
import { after } from "next/server";
import { createResumableStreamContext } from "resumable-stream";
import { auth, type UserType } from "@/app/(auth)/auth";
import { entitlementsByUserType } from "@/lib/ai/entitlements";
import {
  allowedModelIds,
  chatModels,
  DEFAULT_CHAT_MODEL,
  getCapabilities,
} from "@/lib/ai/models";
import { type RequestHints, systemPrompt } from "@/lib/ai/prompts";
import { getLanguageModel, isGatewayProviderEnabled } from "@/lib/ai/providers";
import { createDocument } from "@/lib/ai/tools/create-document";
import { editDocument } from "@/lib/ai/tools/edit-document";
import { getWeather } from "@/lib/ai/tools/get-weather";
import { ragQuery } from "@/lib/ai/tools/rag-query";
import { requestSuggestions } from "@/lib/ai/tools/request-suggestions";
import { updateDocument } from "@/lib/ai/tools/update-document";
import { isProductionEnvironment } from "@/lib/constants";
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getMessageCountByUserId,
  getMessagesByChatId,
  saveChat,
  saveMessages,
  updateChatTitleById,
  updateMessage,
} from "@/lib/db/queries";
import type { DBMessage } from "@/lib/db/schema";
import { ChatbotError } from "@/lib/errors";
import { checkIpRateLimit } from "@/lib/ratelimit";
import type { ChatMessage } from "@/lib/types";
import { convertToUIMessages, generateUUID } from "@/lib/utils";
import { generateTitleFromUserMessage } from "../../actions";
import { type PostRequestBody, postRequestBodySchema } from "./schema";

export const maxDuration = 60;
const ragApiUrl =
  process.env.RAG_API_URL ??
  process.env.NEXT_PUBLIC_RAG_API_URL ??
  "http://localhost:8000";
const RAG_CONTEXT_PREVIEW_LIMIT = 700;

function truncateRagContext(context: string) {
  const normalized = context.replace(/\s+/g, " ").trim();
  if (normalized.length <= RAG_CONTEXT_PREVIEW_LIMIT) {
    return normalized;
  }
  return `${normalized.slice(0, RAG_CONTEXT_PREVIEW_LIMIT)}...`;
}

function getMessageText(message: ChatMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join(" ")
    .trim();
}

/** Very short user phrases like «привет» — RAG query must come from attachments, not from greeting semantics. */
const SHORT_USER_GREETING_RE =
  /^(?:привет!?|здравствуйте!?|добрый\s+(?:день|вечер|утро)!?|hi!?|hello!?)(?:\s|$)/iu;

function isShortGreetingText(text: string): boolean {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length === 0 || trimmed.length > 120) {
    return false;
  }
  return SHORT_USER_GREETING_RE.test(trimmed);
}

/** Names + text excerpts from file parts so RAG query generation is not blind to uploads. */
function collectAttachmentHintsForRetrieval(messages: ChatMessage[]): string {
  const chunks: string[] = [];

  for (const message of messages.slice(-12)) {
    if (message.role !== "user") {
      continue;
    }

    for (const part of message.parts) {
      if (part.type !== "file") {
        continue;
      }

      const filePart = part as {
        filename?: string;
        name?: string;
        extractedText?: string;
      };
      const filename =
        typeof filePart.filename === "string"
          ? filePart.filename
          : typeof filePart.name === "string"
            ? filePart.name
            : "вложение";

      const excerptRaw =
        typeof filePart.extractedText === "string"
          ? filePart.extractedText.replace(/\s+/g, " ").trim()
          : "";

      const excerpt =
        excerptRaw.length > 1200 ? `${excerptRaw.slice(0, 1200)}…` : excerptRaw;

      if (excerpt.length > 0) {
        chunks.push(`Файл «${filename}», фрагмент текста: ${excerpt}`);
      } else {
        chunks.push(
          `Файл «${filename}» (текст на сервере мог быть не извлечён в этот момент — формулируй запрос по имени файла как расшифровке/протоколу встречи Форус).`
        );
      }
    }
  }

  return chunks.join("\n\n");
}

async function queryRagContext(question: string) {
  const queryResponse = await fetch(`${ragApiUrl}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, mode: "hybrid" }),
  });

  if (!queryResponse.ok) {
    const text = await queryResponse.text();
    throw new Error(`RAG query failed: ${queryResponse.status} ${text}`);
  }

  const json = (await queryResponse.json()) as { answer?: string };
  return json.answer ?? "";
}

async function buildRetrievalQuery({
  modelId,
  uiMessages,
  currentUserText,
  attachmentHints,
}: {
  modelId: string;
  uiMessages: ChatMessage[];
  currentUserText: string;
  attachmentHints: string;
}) {
  const dialogue = uiMessages
    .slice(-10)
    .map((message) => {
      const text = getMessageText(message);
      if (text.length === 0) {
        return null;
      }
      return `${message.role === "assistant" ? "assistant" : "user"}: ${text}`;
    })
    .filter((line): line is string => Boolean(line))
    .join("\n");

  const trimmedHints = attachmentHints.trim();
  const trimmedUser = currentUserText.replace(/\s+/g, " ").trim();

  let fallbackQuery = trimmedUser;
  if (fallbackQuery.length === 0 && trimmedHints.length > 0) {
    fallbackQuery =
      "протокол встречи расшифровка повестка решения участники содержание документа Форус";
  } else if (trimmedHints.length > 0 && isShortGreetingText(fallbackQuery)) {
    fallbackQuery =
      "расшифровка встречи ключевые темы решения участники протокол компании Форус содержание документа";
  }

  const hintsBlock =
    trimmedHints.length > 0
      ? `\n\nПрикреплённые документы (обязательно учти при формулировке запроса):\n${trimmedHints}`
      : "";

  try {
    const result = await generateText({
      model: getLanguageModel(modelId),
      system: `Сгенерируй один поисковый запрос для корпоративной базы документов (RAG), связанной с протоколами встреч компании Форус.

Правила:
- Только финальный запрос на русском языке, без пояснений и кавычек.
- Если пользователь пишет короткое приветствие («привет», «здравствуйте»), но есть вложения или расшифровка — запрос должен описывать содержание встречи, темы, решения, участников, повестку; НЕ используй слова про «приветствия», «русский этикет», общую болтовню.
- Если есть фрагменты текста из файлов — включи в запрос сущности из них (названия проектов, даты, имена ролей), если они явно видны.
- Если последнее сообщение пустое, но есть вложения — запрос только по содержанию вложений/протокола.`,
      prompt: `Контекст диалога (только текстовые реплики):
${dialogue || "(пусто)"}
${hintsBlock}

Последнее сообщение пользователя (может быть пустым):
${trimmedUser.length > 0 ? trimmedUser : "(нет текста — только вложения)"}

Верни один итоговый RAG-запрос на русском.`,
    });

    const query = result.text.replace(/\s+/g, " ").trim();
    if (query.length > 0) {
      return query;
    }
  } catch (error) {
    console.warn(
      "[chat] Retrieval query generation failed, using user message",
      error
    );
  }

  return fallbackQuery;
}

async function buildMeetingContextSummary({
  modelId,
  uiMessages,
  ragContext,
  attachmentHints,
}: {
  modelId: string;
  uiMessages: ChatMessage[];
  ragContext: string;
  attachmentHints: string;
}) {
  const dialogue = uiMessages
    .slice(-20)
    .map((message) => {
      const text = getMessageText(message);
      if (text.length === 0) {
        return null;
      }
      return `${message.role === "assistant" ? "ASSISTANT" : "USER"}: ${text}`;
    })
    .filter((line): line is string => Boolean(line))
    .join("\n");

  const ragSnippet =
    ragContext.length > 0 ? truncateRagContext(ragContext) : "";
  const hintsSnippet =
    attachmentHints.trim().length > 0
      ? attachmentHints.trim()
      : "(вложения без извлечённого текста в этом запросе)";

  try {
    const result = await generateText({
      model: getLanguageModel(modelId),
      system:
        "Ты ведешь рабочую память встречи для протокола компании Форус. Верни только структурированный summary на русском языке в markdown.",
      prompt: `Сформируй "рабочую память встречи" по диалогу, фрагментам вложений и RAG.

Требования к формату:
- Что уже подтверждено (буллеты)
- Участники и роли (буллеты)
- Цели/повестка (буллеты)
- Решения и договоренности (буллеты)
- Открытые вопросы/пробелы (буллеты)

Важно:
- Не выдумывай факты.
- Фиксируй только подтвержденные данные.
- Кратко, но предметно.

Диалог:
${dialogue}

Фрагменты из прикреплённых файлов (если есть):
${hintsSnippet}

RAG-контекст (кратко):
${ragSnippet}`,
    });

    return result.text.trim();
  } catch (error) {
    console.warn("[chat] Meeting context summary failed", error);
    return "";
  }
}

function isGenericChatTitle(title: string) {
  const normalized = title.trim().toLowerCase();
  return (
    normalized === "new chat" ||
    normalized === "new conversation" ||
    normalized === "новый чат"
  );
}

function getStreamContext() {
  try {
    return createResumableStreamContext({ waitUntil: after });
  } catch (_) {
    return null;
  }
}

export { getStreamContext };

function toLocalCompatibleMessage(message: ChatMessage): ChatMessage {
  const transformedParts = message.parts.flatMap((part) => {
    if (part.type === "file") {
      const fileName = part.filename ?? "attachment";
      const extractedText =
        "extractedText" in part && typeof part.extractedText === "string"
          ? part.extractedText
          : undefined;
      const fileContext = extractedText
        ? [
            `[НАЧАЛО_ТЕКСТА_ДОКУМЕНТА имя="${fileName}"]`,
            "Ниже приведён текст вложения (цитирование). Это не реплика пользователя в чате; используй как источник фактов для протокола Форус. Ответ пользователю формулируй на русском.",
            extractedText,
            "[КОНЕЦ_ТЕКСТА_ДОКУМЕНТА]",
          ].join("\n")
        : `[ССЫЛКА_НА_ФАЙЛ имя="${fileName}" url="${part.url}"]`;

      return [
        {
          type: "text" as const,
          text: fileContext,
        },
      ];
    }

    return [part];
  });

  return {
    ...message,
    parts: transformedParts,
  };
}

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (_) {
    return new ChatbotError("bad_request:api").toResponse();
  }

  try {
    const {
      id,
      message,
      messages,
      selectedChatModel,
      selectedVisibilityType,
      excludedAttachmentUrls = [],
    } = requestBody;

    const [, session] = await Promise.all([
      checkBotId().catch(() => null),
      auth(),
    ]);

    if (!session?.user) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }

    const chatModel = allowedModelIds.has(selectedChatModel)
      ? selectedChatModel
      : DEFAULT_CHAT_MODEL;

    await checkIpRateLimit(ipAddress(request));

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
      if (
        message?.role === "user" &&
        isGenericChatTitle(chat.title) &&
        messagesFromDb.length === 0
      ) {
        titlePromise = generateTitleFromUserMessage({ message });
      }
    } else if (message?.role === "user") {
      await saveChat({
        id,
        userId: session.user.id,
        title: "Новый чат",
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
      uiMessages = [
        ...convertToUIMessages(messagesFromDb),
        message as ChatMessage,
      ];
    }

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    if (message?.role === "user") {
      await saveMessages({
        messages: [
          {
            chatId: id,
            id: message.id,
            role: "user",
            parts: message.parts,
            attachments: [],
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
    const isLocalProvider = !isGatewayProviderEnabled;
    const userMessageText =
      message?.parts
        ?.filter((part) => part.type === "text")
        .map((part) => part.text)
        .join(" ")
        .trim() ?? "";

    const excludedUrlSet = new Set(excludedAttachmentUrls);
    const contextFilteredMessages = uiMessages.map((uiMessage) => ({
      ...uiMessage,
      parts: uiMessage.parts.filter((part) => {
        if (part.type !== "file") {
          return true;
        }
        return !excludedUrlSet.has(part.url);
      }),
    }));

    const messagesForModel = isLocalProvider
      ? contextFilteredMessages.map(toLocalCompatibleMessage)
      : contextFilteredMessages;
    const modelMessages = await convertToModelMessages(messagesForModel);

    const stream = createUIMessageStream({
      originalMessages: isToolApprovalFlow ? uiMessages : undefined,
      execute: async ({ writer: dataStream }) => {
        const streamStartedAt = Date.now();
        dataStream.write({
          type: "data-chat-progress",
          data: "Анализирую запрос и историю диалога...",
        });
        console.info("[chat] stream start", {
          chatId: id,
          model: chatModel,
          supportsTools,
          isReasoningModel,
        });

        const baseSystemText = systemPrompt({ requestHints, supportsTools });
        let ragQueryUsed = "";
        let ragContext = "";
        let ragContextPreview = "";
        let meetingContextSummary = "";

        const attachmentHintsForRetrieval = collectAttachmentHintsForRetrieval(
          contextFilteredMessages
        );
        const shouldPrefetchRag =
          userMessageText.trim().length > 0 ||
          attachmentHintsForRetrieval.trim().length > 0;

        if (shouldPrefetchRag) {
          try {
            dataStream.write({
              type: "data-chat-progress",
              data: "Формирую поисковый запрос к документам...",
            });
            ragQueryUsed = await buildRetrievalQuery({
              modelId: chatModel,
              uiMessages: contextFilteredMessages,
              currentUserText: userMessageText,
              attachmentHints: attachmentHintsForRetrieval,
            });
            dataStream.write({
              type: "data-chat-progress",
              data: "Ищу релевантный контекст в RAG...",
            });
            ragContext = await queryRagContext(ragQueryUsed);
            ragContextPreview = truncateRagContext(ragContext);
            console.info("[chat] RAG prefetch success", {
              ragQueryUsed,
              ragContextLength: ragContext.length,
            });
          } catch (error) {
            console.error("[chat] RAG prefetch failed", error);
          }
        }

        dataStream.write({
          type: "data-chat-progress",
          data: "Обновляю рабочую память встречи...",
        });
        meetingContextSummary = await buildMeetingContextSummary({
          modelId: chatModel,
          uiMessages: contextFilteredMessages,
          ragContext,
          attachmentHints: attachmentHintsForRetrieval,
        });

        const ragInstruction = supportsTools
          ? `

Инструмент ragQuery (не ослабляет режим Форус из системного промпта):
- Перед итоговым текстом для пользователя вызови инструмент ragQuery с запросом по полному контексту чата и задаче протокола Форус (не только по последней короткой реплике).
- Смысл ответа опирай на возвращённый контекст RAG.
- Весь видимый пользователю текст ответа — только на русском; без англоязычных обзоров, учебных планов и консалтинговых эссе.

Порядок в тексте для пользователя (видимая часть):
1) Если это первый ответ ассистента в чате — сначала представление и приветствие Форус и явное начало работы над протоколом (как в системном промпте).
2) Служебные строки про RAG в чат пользователю не выводи (query/preview для отладки не нужны).
3) Далее содержательная работа по протоколу (блоки «Что уже известно», раздел и т.д.) — заголовки и текст только на русском.

Разделение источников:
- Текст расшифровки и документов — внешний источник, не личность пользователя.
- Не обращайся к пользователю по именам/ролям из документов, если он сам так себя не назвал.
- Отличай формулировку запроса пользователя от фактов из документов.`
          : "";
        const prefetchedRagBlock =
          ragContext.length > 0
            ? `

Контекст из корпоративной базы (RAG), уже полученный на сервере — опирайся при формулировках протокола:
- использованный запрос: ${ragQueryUsed}
- краткий превью контекста: ${ragContextPreview}

Полный текст контекста RAG:
${ragContext}`
            : "";
        const meetingMemoryBlock =
          meetingContextSummary.length > 0
            ? `

Рабочая память встречи (кумулятивный контекст по диалогу и вложениям — используй при ответе):
${meetingContextSummary}`
            : "";
        const systemText = `${baseSystemText}${prefetchedRagBlock}${meetingMemoryBlock}${ragInstruction}`;
        const streamMessages = modelMessages.map((streamMessage) => {
          const role =
            typeof streamMessage === "object" &&
            streamMessage !== null &&
            "role" in streamMessage
              ? (streamMessage.role as string)
              : "";

          if (role === "developer" || role === "system") {
            return {
              ...(streamMessage as Record<string, unknown>),
              role: "user" as const,
            };
          }

          return streamMessage;
        });

        console.info("[chat] stream roles", {
          model: chatModel,
          isLocalProvider,
          roles: streamMessages.map((streamMessage) =>
            typeof streamMessage === "object" &&
            streamMessage !== null &&
            "role" in streamMessage
              ? (streamMessage.role as string)
              : "?"
          ),
        });

        dataStream.write({
          type: "data-chat-progress",
          data: "Формирую итоговый ответ...",
        });
        // AI SDK: `prompt` — для простых одноходовых запросов без истории чата.
        // Здесь нужны `system` + `messages`, иначе теряется диалог и вложения в ролях user/assistant.
        const result = streamText({
          model: getLanguageModel(chatModel),
          system: systemText,
          messages: streamMessages as never,
          stopWhen: stepCountIs(5),
          experimental_activeTools:
            isReasoningModel && !supportsTools
              ? []
              : [
                  "ragQuery",
                  "getWeather",
                  "createDocument",
                  "editDocument",
                  "updateDocument",
                  "requestSuggestions",
                ],
          providerOptions: {
            ...(isGatewayProviderEnabled &&
              modelConfig?.gatewayOrder && {
                gateway: { order: modelConfig.gatewayOrder },
              }),
            ...(modelConfig?.reasoningEffort && {
              openai: { reasoningEffort: modelConfig.reasoningEffort },
            }),
          },
          tools: {
            ragQuery,
            getWeather,
            createDocument: createDocument({
              session,
              dataStream,
              modelId: chatModel,
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
          await updateChatTitleById({ chatId: id, title });
        }

        const usage = await result.usage;
        dataStream.write({ type: "data-chat-progress", data: "" });
        console.info("[chat] stream finish", {
          chatId: id,
          model: chatModel,
          durationMs: Date.now() - streamStartedAt,
          usage,
        });
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
      async consumeSseStream({ stream: sseStream }) {
        if (!process.env.REDIS_URL) {
          return;
        }
        try {
          const streamContext = getStreamContext();
          if (streamContext) {
            const streamId = generateId();
            await createStreamId({ streamId, chatId: id });
            await streamContext.createNewResumableStream(
              streamId,
              () => sseStream
            );
          }
        } catch (_) {
          /* non-critical */
        }
      },
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

    console.error("Unhandled error in chat API:", error, { vercelId });
    return new ChatbotError("offline:chat").toResponse();
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

  if (!chat) {
    return Response.json({ id, deleted: true }, { status: 200 });
  }

  if (chat.userId !== session.user.id) {
    return new ChatbotError("forbidden:chat").toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}

export async function PATCH(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  try {
    const body = (await request.json()) as { id?: string; title?: string };
    const id = body.id?.trim();
    const title = body.title?.trim();

    if (!id || !title) {
      return new ChatbotError("bad_request:api").toResponse();
    }

    const chat = await getChatById({ id });
    if (!chat || chat.userId !== session.user.id) {
      return new ChatbotError("forbidden:chat").toResponse();
    }

    await updateChatTitleById({ chatId: id, title: title.slice(0, 120) });
    return Response.json({ ok: true }, { status: 200 });
  } catch {
    return new ChatbotError("bad_request:api").toResponse();
  }
}
