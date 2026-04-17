import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

const lmStudio = createOpenAI({
  baseURL: process.env.LOCAL_LLM_BASE_URL ?? "http://127.0.0.1:1234/v1",
  apiKey: process.env.LOCAL_LLM_API_KEY ?? "lm-studio",
});

const rerankerModel = process.env.LOCAL_LLM_MODEL ?? "qwen/qwen3.5-35b-a3b";

interface RankedChunk {
  text: string;
  fileName: string;
  originalScore: number;
  rerankScore: number;
  relevance: number;
  reasoning: string;
}

/**
 * LLM-based reranking для top-K chunks
 * Использует LLM как cross-encoder для оценки релевантности каждого chunk'а
 */
export async function rerankChunks(params: {
  query: string;
  chunks: Array<{ text: string; fileName: string; score: number }>;
  topK?: number;
}): Promise<RankedChunk[]> {
  const topK = params.topK ?? 10;
  
  // Reranking дорогой, поэтому делаем только для top-20 chunk'ов
  const chunksToRerank = params.chunks.slice(0, 20);

  if (chunksToRerank.length === 0) {
    return [];
  }

  // Параллельный reranking с ограничением concurrency
  const results: RankedChunk[] = [];
  const batchSize = 3; // Обрабатываем по 3 chunk'а параллельно

  for (let i = 0; i < chunksToRerank.length; i += batchSize) {
    const batch = chunksToRerank.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (chunk) => {
        try {
          const score = await scoreChunkRelevance(params.query, chunk.text);
          return {
            text: chunk.text,
            fileName: chunk.fileName,
            originalScore: chunk.score,
            rerankScore: score.relevance,
            relevance: score.relevance,
            reasoning: score.reasoning,
          };
        } catch (error) {
          console.warn("[Reranking] Failed to score chunk:", error);
          return {
            text: chunk.text,
            fileName: chunk.fileName,
            originalScore: chunk.score,
            rerankScore: 0,
            relevance: 0,
            reasoning: "Scoring failed",
          };
        }
      })
    );
    results.push(...batchResults);
  }

  // Сортируем по rerank score
  const ranked = results
    .sort((a, b) => b.rerankScore - a.rerankScore)
    .slice(0, topK);

  return ranked;
}

/**
 * Оценивает релевантность chunk'а запросу через LLM
 */
async function scoreChunkRelevance(query: string, chunkText: string) {
  const maxLength = 1500;
  const truncatedText = chunkText.length > maxLength 
    ? chunkText.slice(0, maxLength) + "..." 
    : chunkText;

  const { text } = await generateText({
    model: lmStudio.chat(rerankerModel),
    maxOutputTokens: 64, // Уменьшаем — JSON короткий
    temperature: 0.05,   // Минимальная температура для детерминизма
    system: `You are a cross-encoder reranker. Score the relevance of a text chunk to a query.

OUTPUT FORMAT - JSON ONLY, NO REASONING, NO MARKDOWN:
{"r":0.0-1.0}

SCORING:
- 0.0: Irrelevant
- 0.3: Mentions topic
- 0.6: Partially answers
- 0.9: Directly answers
- 1.0: Perfect match`,
    prompt: `Query: "${query}"

Text:
${truncatedText}

JSON:`,
  });

  try {
    // Очищаем от markdown, reasoning, etc
    const cleaned = text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .replace(/\{[^}]*\}/g, (match) => match) // extract first JSON object
      .trim();
    
    // Попробуем распарсить прямой JSON
    const parsed = JSON.parse(cleaned);
    const relevance = parsed.r ?? parsed.relevance ?? parsed.score ?? 0;
    
    return {
      relevance: Math.max(0, Math.min(1, Number(relevance))),
      reasoning: parsed.reasoning ?? `Score: ${relevance}`,
    };
  } catch {
    // Fallback: попробуем извлечь число из текста
    const numberMatch = text.match(/(\d\.?\d?)/);
    if (numberMatch) {
      const num = parseFloat(numberMatch[1]);
      if (!isNaN(num) && num >= 0 && num <= 1) {
        return { relevance: num, reasoning: `Extracted from text: ${num}` };
      }
    }
    return { relevance: 0.5, reasoning: "Parse failed, default 0.5" };
  }
}

/**
 * Быстрый reranking на основе keyword matching (fallback без LLM)
 */
export function rerankChunksKeyword(query: string, chunks: Array<{ text: string; fileName: string; score: number }>, topK?: number) {
  const topKValue = topK ?? 10;
  const queryTerms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);

  if (queryTerms.length === 0) {
    return chunks.map((c) => ({
      ...c,
      rerankScore: c.score,
      relevance: c.score,
      reasoning: "Keyword reranking (no query terms)",
    })).slice(0, topKValue);
  }

  const reranked = chunks.map((chunk) => {
    const textLower = chunk.text.toLowerCase();
    let keywordScore = 0;

    for (const term of queryTerms) {
      const occurrences = (textLower.match(new RegExp(term, "g")) || []).length;
      keywordScore += Math.min(occurrences * 0.1, 0.5); // Cap at 0.5 per term
    }

    // Комбинируем original score (40%) + keyword score (60%)
    const combinedScore = chunk.score * 0.4 + keywordScore * 0.6;

    return {
      ...chunk,
      rerankScore: combinedScore,
      relevance: combinedScore,
      reasoning: `Keyword reranking: ${queryTerms.length} terms, ${keywordScore.toFixed(2)} keyword score`,
    };
  });

  return reranked
    .sort((a, b) => b.rerankScore - a.rerankScore)
    .slice(0, topKValue);
}
