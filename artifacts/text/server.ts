import { smoothStream, streamText } from "ai";
import { updateDocumentPrompt } from "@/lib/ai/prompts";
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
      system:
        "Write about the given topic. Markdown is supported. Use headings wherever appropriate.",
      experimental_transform: smoothStream({ chunking: "word" }),
      prompt: title,
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
      system: updateDocumentPrompt(document.content, "text"),
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
