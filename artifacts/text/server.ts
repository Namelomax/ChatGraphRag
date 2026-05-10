import { smoothStream, streamText } from "ai";
import {
  TEXT_ARTIFACT_FORUS_PROTOCOL_SYSTEM,
  updateDocumentPrompt,
} from "@/lib/ai/prompts";
import { getLanguageModel } from "@/lib/ai/providers";
import { createDocumentHandler } from "@/lib/artifacts/server";

export const textDocumentHandler = createDocumentHandler<"text">({
  kind: "text",
  onCreateDocument: async ({ title, dataStream, modelId }) => {
    let draftContent = "";
    const startedAt = Date.now();
    let firstTokenAt: number | null = null;

    const result = streamText({
      model: getLanguageModel(modelId),
      system: TEXT_ARTIFACT_FORUS_PROTOCOL_SYSTEM,
      experimental_transform: smoothStream({ chunking: "word" }),
      prompt: `Заголовок или указание пользователя к документу:\n${title}\n\nСформируй полный протокол по структуре выше.`,
    });

    for await (const delta of result.fullStream) {
      if (delta.type === "text-delta") {
        if (firstTokenAt === null) {
          firstTokenAt = Date.now();
          console.info("[artifact:text:create] first token", {
            model: modelId,
            firstTokenLatencyMs: firstTokenAt - startedAt,
          });
        }
        draftContent += delta.text;
        dataStream.write({
          type: "data-textDelta",
          data: delta.text,
          transient: true,
        });
      }
    }

    const usage = await result.usage;
    console.info("[artifact:text:create] complete", {
      model: modelId,
      durationMs: Date.now() - startedAt,
      usage,
    });

    return draftContent;
  },
  onUpdateDocument: async ({ document, description, dataStream, modelId }) => {
    let draftContent = "";
    const startedAt = Date.now();
    let firstTokenAt: number | null = null;

    const result = streamText({
      model: getLanguageModel(modelId),
      system: `${TEXT_ARTIFACT_FORUS_PROTOCOL_SYSTEM}\n\nТекущий документ ниже — сохраняй согласованные факты и правь только по описанию изменений.\n\n${updateDocumentPrompt(document.content, "text")}`,
      experimental_transform: smoothStream({ chunking: "word" }),
      prompt: description,
    });

    for await (const delta of result.fullStream) {
      if (delta.type === "text-delta") {
        if (firstTokenAt === null) {
          firstTokenAt = Date.now();
          console.info("[artifact:text:update] first token", {
            model: modelId,
            firstTokenLatencyMs: firstTokenAt - startedAt,
          });
        }
        draftContent += delta.text;
        dataStream.write({
          type: "data-textDelta",
          data: delta.text,
          transient: true,
        });
      }
    }

    const usage = await result.usage;
    console.info("[artifact:text:update] complete", {
      model: modelId,
      durationMs: Date.now() - startedAt,
      usage,
    });

    return draftContent;
  },
});
