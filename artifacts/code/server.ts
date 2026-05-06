import { streamText } from "ai";
import { codePrompt, updateDocumentPrompt } from "@/lib/ai/prompts";
import { getLanguageModel } from "@/lib/ai/providers";
import { createDocumentHandler } from "@/lib/artifacts/server";

function stripFences(code: string): string {
  return code
    .replace(/^```[\w]*\n?/, "")
    .replace(/\n?```\s*$/, "")
    .trim();
}

export const codeDocumentHandler = createDocumentHandler<"code">({
  kind: "code",
  onCreateDocument: async ({ title, dataStream, modelId }) => {
    let draftContent = "";
    const startedAt = Date.now();
    let firstTokenAt: number | null = null;

    const result = streamText({
      model: getLanguageModel(modelId),
      system: `${codePrompt}\n\nOutput ONLY the code. No explanations, no markdown fences, no wrapping.`,
      prompt: title,
    });

    for await (const delta of result.fullStream) {
      if (delta.type === "text-delta") {
        if (firstTokenAt === null) {
          firstTokenAt = Date.now();
          console.info("[artifact:code:create] first token", {
            model: modelId,
            firstTokenLatencyMs: firstTokenAt - startedAt,
          });
        }
        draftContent += delta.text;
        dataStream.write({
          type: "data-codeDelta",
          data: stripFences(draftContent),
          transient: true,
        });
      }
    }

    const usage = await result.usage;
    console.info("[artifact:code:create] complete", {
      model: modelId,
      durationMs: Date.now() - startedAt,
      usage,
    });

    return stripFences(draftContent);
  },
  onUpdateDocument: async ({ document, description, dataStream, modelId }) => {
    let draftContent = "";
    const startedAt = Date.now();
    let firstTokenAt: number | null = null;

    const result = streamText({
      model: getLanguageModel(modelId),
      system: `${updateDocumentPrompt(document.content, "code")}\n\nOutput ONLY the complete updated code. No explanations, no markdown fences, no wrapping.`,
      prompt: description,
    });

    for await (const delta of result.fullStream) {
      if (delta.type === "text-delta") {
        if (firstTokenAt === null) {
          firstTokenAt = Date.now();
          console.info("[artifact:code:update] first token", {
            model: modelId,
            firstTokenLatencyMs: firstTokenAt - startedAt,
          });
        }
        draftContent += delta.text;
        dataStream.write({
          type: "data-codeDelta",
          data: stripFences(draftContent),
          transient: true,
        });
      }
    }

    const usage = await result.usage;
    console.info("[artifact:code:update] complete", {
      model: modelId,
      durationMs: Date.now() - startedAt,
      usage,
    });

    return stripFences(draftContent);
  },
});
