"use server";

import { generateText, type UIMessage } from "ai";
import { cookies } from "next/headers";
import { auth } from "@/app/(auth)/auth";
import type { VisibilityType } from "@/components/chat/visibility-selector";
import { isLocalProviderEnabled } from "@/lib/ai/models";
import { titleModel } from "@/lib/ai/models";
import { titlePrompt } from "@/lib/ai/prompts";
import { getTitleModel, isGatewayProviderEnabled } from "@/lib/ai/providers";
import {
  deleteMessagesByChatIdAfterTimestamp,
  getChatById,
  getMessageById,
  updateChatVisibilityById,
} from "@/lib/db/queries";
import { getTextFromMessage } from "@/lib/utils";

function generateLocalTitle(inputText: string): string {
  const normalized = inputText.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "Новый чат";
  }

  const words = normalized
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 5);

  if (words.length === 0) {
    return "Новый чат";
  }

  const title = words.join(" ");
  return title.length > 48 ? `${title.slice(0, 48).trim()}...` : title;
}

export async function saveChatModelAsCookie(model: string) {
  const cookieStore = await cookies();
  cookieStore.set("chat-model", model);
}

export async function generateTitleFromUserMessage({
  message,
}: {
  message: UIMessage;
}) {
  const startedAt = Date.now();
  const prompt = getTextFromMessage(message);

  if (isLocalProviderEnabled) {
    const title = generateLocalTitle(prompt);
    console.info("[chat] title generated (local)", {
      durationMs: Date.now() - startedAt,
      title,
    });
    return title;
  }

  const { text } = await generateText({
    model: getTitleModel(),
    system: titlePrompt,
    prompt,
    ...(isGatewayProviderEnabled &&
      titleModel.gatewayOrder && {
        providerOptions: {
          gateway: { order: titleModel.gatewayOrder },
        },
      }),
  });

  const title = text
    .replace(/^[#*"\s]+/, "")
    .replace(/["]+$/, "")
    .trim();

  console.info("[chat] title generated", {
    durationMs: Date.now() - startedAt,
    title,
  });

  return title;
}

export async function deleteTrailingMessages({ id }: { id: string }) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const [message] = await getMessageById({ id });
  if (!message) {
    throw new Error("Message not found");
  }

  const chat = await getChatById({ id: message.chatId });
  if (!chat || chat.userId !== session.user.id) {
    throw new Error("Unauthorized");
  }

  await deleteMessagesByChatIdAfterTimestamp({
    chatId: message.chatId,
    timestamp: message.createdAt,
  });
}

export async function updateChatVisibility({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: VisibilityType;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const chat = await getChatById({ id: chatId });
  if (!chat || chat.userId !== session.user.id) {
    throw new Error("Unauthorized");
  }

  await updateChatVisibilityById({ chatId, visibility });
}
