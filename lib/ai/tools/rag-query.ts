import { tool } from "ai";
import { z } from "zod";

const ragApiUrl =
  process.env.RAG_API_URL ??
  process.env.NEXT_PUBLIC_RAG_API_URL ??
  "http://localhost:8000";

const RAG_CONTEXT_PREVIEW_LIMIT = 700;

function truncateContext(context: string) {
  const normalized = context.replace(/\s+/g, " ").trim();
  if (normalized.length <= RAG_CONTEXT_PREVIEW_LIMIT) {
    return normalized;
  }
  return `${normalized.slice(0, RAG_CONTEXT_PREVIEW_LIMIT)}...`;
}

export const ragQuery = tool({
  description:
    "Запрос к RAG-бэкенду по лучшему поисковому запросу из контекста диалога. Формулируй query на русском языке и вызывай перед финальным ответом.",
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .max(500)
      .describe("The retrieval query to send to the RAG service"),
    mode: z.enum(["hybrid", "local", "global"]).default("hybrid").optional(),
  }),
  execute: async ({ query, mode = "hybrid" }) => {
    const response = await fetch(`${ragApiUrl}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: query, mode }),
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        error: `RAG query failed: ${response.status} ${text}`,
        query,
        mode,
      };
    }

    const json = (await response.json()) as { answer?: string };
    const context = json.answer ?? "";

    return {
      query,
      mode,
      context,
      contextPreview: truncateContext(context),
      contextLength: context.length,
    };
  },
});
