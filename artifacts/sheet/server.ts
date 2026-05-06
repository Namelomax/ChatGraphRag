import { streamText } from "ai";
import { sheetPrompt, updateDocumentPrompt } from "@/lib/ai/prompts";
import { getLanguageModel } from "@/lib/ai/providers";
import { createDocumentHandler } from "@/lib/artifacts/server";

export const sheetDocumentHandler = createDocumentHandler<"sheet">({
  kind: "sheet",
  onCreateDocument: async ({ title, dataStream, modelId }) => {
    let draftContent = "";
    const startedAt = Date.now();
    let firstTokenAt: number | null = null;

    const result = streamText({
      model: getLanguageModel(modelId),
      system: `${sheetPrompt}\n\nOutput ONLY the raw CSV data. No explanations, no markdown fences.`,
      prompt: title,
    });

    for await (const delta of result.fullStream) {
      if (delta.type === "text-delta") {
        if (firstTokenAt === null) {
          firstTokenAt = Date.now();
          console.info("[artifact:sheet:create] first token", {
            model: modelId,
            firstTokenLatencyMs: firstTokenAt - startedAt,
          });
        }
        draftContent += delta.text;
        dataStream.write({
          type: "data-sheetDelta",
          data: draftContent,
          transient: true,
        });
      }
    }

    const usage = await result.usage;
    console.info("[artifact:sheet:create] complete", {
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
      system: `${updateDocumentPrompt(document.content, "sheet")}\n\nOutput ONLY the raw CSV data. No explanations, no markdown fences.`,
      prompt: description,
    });

    for await (const delta of result.fullStream) {
      if (delta.type === "text-delta") {
        if (firstTokenAt === null) {
          firstTokenAt = Date.now();
          console.info("[artifact:sheet:update] first token", {
            model: modelId,
            firstTokenLatencyMs: firstTokenAt - startedAt,
          });
        }
        draftContent += delta.text;
        dataStream.write({
          type: "data-sheetDelta",
          data: draftContent,
          transient: true,
        });
      }
    }

    const usage = await result.usage;
    console.info("[artifact:sheet:update] complete", {
      model: modelId,
      durationMs: Date.now() - startedAt,
      usage,
    });

    return draftContent;
  },
});
