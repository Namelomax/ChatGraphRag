import { embedText, embedTexts, cosineSimilarity } from "./embeddings";
import { chunkText } from "./chunker";
import { ensureRagSchema, getChunksByUser, insertChunk, getSurreal } from "./surreal";
import { extractEntitiesAndRelations, normalizeEntities } from "./entity-extraction";
import {
  ensureKnowledgeGraphSchema,
  insertKnowledgeEntity,
  insertKnowledgeRelation,
  getKnowledgeGraphForChat,
} from "./knowledge-graph";
import { rerankChunks, rerankChunksKeyword } from "./reranker";
import { ragConfig } from "./config";

export async function indexDocumentToGraphRag(input: {
  chatId: string;
  userId: string;
  fileName: string;
  text: string;
}) {
  const chunks = chunkText(input.text, ragConfig.chunkSize, ragConfig.overlap);
  if (chunks.length === 0) {
    return 0;
  }

  await ensureRagSchema();

  // Создаём эмбеддинги батчем для эффективности
  const embeddings = await embedTexts(chunks);
  const chunkIds: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const result = await insertChunk({
      chatId: input.chatId,
      userId: input.userId,
      fileName: input.fileName,
      text: chunks[i],
      embedding: embeddings[i],
    });
    if (result?.id) {
      chunkIds.push(result.id);
    }
  }

  // Извлекаем сущности и связи (асинхронно, не блокируем ответ)
  extractAndIndexEntities({
    chatId: input.chatId,
    userId: input.userId,
    text: input.text,
    chunks,
    chunkIds,
  }).catch((err) => console.error("[RAG] Entity extraction failed:", err));

  return chunks.length;
}

/**
 * Фоновое извлечение и индексация сущностей из документа
 */
async function extractAndIndexEntities(input: {
  chatId: string;
  userId: string;
  text: string;
  chunks: string[];
  chunkIds: string[];
}) {
  console.log("[RAG] Starting entity extraction...");

  // Создаём схему графа знаний
  await ensureKnowledgeGraphSchema();

  // Извлекаем сущности и связи из полного текста
  const extraction = await extractEntitiesAndRelations(input.text);

  if (extraction.entities.length === 0) {
    console.log("[RAG] No entities extracted");
    return;
  }

  // Нормализуем сущности (объединяем дубликаты)
  const normalizedEntities = normalizeEntities(extraction.entities);

  console.log(`[RAG] Extracted ${normalizedEntities.length} entities, ${extraction.relations.length} relations`);

  // Индексируем сущности
  const entityIds: string[] = [];
  for (const entity of normalizedEntities) {
    try {
      // Находим chunk'и, где упоминается сущность
      const relatedChunkIndices: number[] = [];
      for (let i = 0; i < input.chunks.length; i++) {
        if (input.chunks[i].toLowerCase().includes(entity.name.toLowerCase())) {
          relatedChunkIndices.push(i);
        }
      }

      const entityId = await insertKnowledgeEntity({
        chatId: input.chatId,
        userId: input.userId,
        name: entity.name,
        entityType: entity.type,
        mentions: entity.mentions,
        context: entity.context,
      });

      entityIds.push(entityId);
    } catch (error) {
      console.warn(`[RAG] Failed to index entity ${entity.name}:`, error);
    }
  }

  // Индексируем связи
  for (const relation of extraction.relations) {
    try {
      await insertKnowledgeRelation({
        chatId: input.chatId,
        userId: input.userId,
        fromEntity: relation.from,
        toEntity: relation.to,
        relationType: relation.type,
        strength: relation.strength,
      });
    } catch (error) {
      console.warn(`[RAG] Failed to index relation ${relation.from} -> ${relation.to}:`, error);
    }
  }

  console.log(`[RAG] Knowledge graph updated: ${entityIds.length} entities, ${extraction.relations.length} relations`);
}

export async function retrieveRagContext(params: {
  chatId: string;
  userId: string;
  query: string;
  topK?: number;
}) {
  const topK = params.topK ?? 15;
  const [queryEmbedding, chunks] = await Promise.all([
    embedText(params.query),
    getChunksByUser(params.userId),
  ]);

  console.log(`[RAG] userId=${params.userId}, query="${params.query.substring(0, 80)}", chunks found=${chunks.length}`);

  if (chunks.length === 0) {
    return "";
  }

  // Классический vector similarity поиск
  const ranked = chunks
    .map((chunk) => ({
      ...chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(topK, chunks.length));

  console.log(`[RAG] Returning ${ranked.length} chunks, top score: ${ranked[0]?.score?.toFixed(3) ?? 'N/A'}`);

  return ranked
    .map(
      (chunk, index) =>
        `[Document ${index + 1}: ${chunk.fileName}]\n${chunk.text.trim()}`
    )
    .join("\n\n---\n\n");
}

export async function retrieveRagContextWithGraph(params: {
  chatId: string;
  userId: string;
  query: string;
  topK?: number;
  useGraphEnhancement?: boolean;
  useReranking?: boolean;
}) {
  const topK = params.topK ?? 15;
  const useGraph = params.useGraphEnhancement ?? true;
  const useReranking = params.useReranking ?? true;

  // Базовый vector retrieval
  const [queryEmbedding, chunks] = await Promise.all([
    embedText(params.query),
    getChunksByUser(params.userId),
  ]);

  if (chunks.length === 0) {
    return "";
  }

  // Step 1: Vector similarity scoring
  const scored = chunks.map((chunk) => ({
    ...chunk,
    score: cosineSimilarity(queryEmbedding, chunk.embedding),
  }));

  // Step 2: Graph-based score boosting
  type ScoredChunk = { text: string; fileName: string; score: number; embedding: number[]; chatId: string; createdAt: string };
  let graphBoosted: ScoredChunk[];
  if (useGraph) {
    try {
      graphBoosted = await boostScoresByGraph({
        chatId: params.chatId,
        chunks: scored,
        query: params.query,
        boostFactor: 0.3,
      });
      console.log("[RAG+Graph] Graph boosting applied");
    } catch (error) {
      console.warn("[RAG+Graph] Graph boosting failed, using original scores:", error);
      graphBoosted = scored;
    }
  } else {
    graphBoosted = scored;
  }

  // Step 3: Reranking (если включён)
  let ranked: Array<{
    text: string;
    fileName: string;
    score: number;
  }>;

  if (useReranking && graphBoosted.length > 0) {
    try {
      // LLM reranking дорогой — только top-3 chunk'а
      // Остальные через keyword matching (мгновенно)
      const topForLLM = graphBoosted.slice(0, 3);
      const restKeyword = graphBoosted.slice(3);

      const reranked = topForLLM.length > 0
        ? await rerankChunks({
            query: params.query,
            chunks: topForLLM,
            topK: 3,
          })
        : [];

      // Остальные chunk'и ранжируем через keyword fallback
      const rerankedRest = rerankChunksKeyword(params.query, restKeyword, topK);

      // Объединяем и сортируем
      const allRanked = [
        ...reranked.map((r) => ({
          text: r.text,
          fileName: r.fileName,
          score: r.rerankScore,
        })),
        ...rerankedRest.map((r) => ({
          text: r.text,
          fileName: r.fileName,
          score: r.rerankScore,
        })),
      ].sort((a, b) => b.score - a.score).slice(0, topK);

      ranked = allRanked;

      console.log(`[RAG+Rerank] LLM reranked ${reranked.length} top + ${rerankedRest.length} keyword, top score: ${allRanked[0]?.score.toFixed(3)}`);
    } catch (error) {
      console.warn("[RAG+Rerank] Reranking failed, falling back to graph-boosted:", error);
      ranked = graphBoosted.sort((a, b) => b.score - a.score).slice(0, topK);
    }
  } else {
    ranked = graphBoosted.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  console.log(`[RAG] Returning ${ranked.length} chunks, top score: ${ranked[0]?.score?.toFixed(3) ?? 'N/A'}`);

  return ranked
    .map(
      (chunk, index) =>
        `[Document ${index + 1}: ${chunk.fileName}]\n${chunk.text.trim()}`
    )
    .join("\n\n---\n\n");
}

/**
 * Boosting scores на основе graph proximity
 * Chunk'и, связанные с важными сущностями, получают бонус
 */
async function boostScoresByGraph(params: {
  chatId: string;
  chunks: Array<{ text: string; fileName: string; score: number; embedding: number[]; chatId: string; createdAt: string }>;
  query: string;
  boostFactor?: number;
}): Promise<Array<{ text: string; fileName: string; score: number; embedding: number[]; chatId: string; createdAt: string }>> {
  const { chatId, chunks, query, boostFactor = 0.3 } = params;

  // Извлекаем ключевые слова из query
  const queryTerms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);

  if (queryTerms.length === 0) {
    return chunks;
  }

  // Ищем сущности, которые матчат query
  const graph = await getKnowledgeGraphForChat(chatId);
  const matchingEntities = new Set<string>();

  for (const entity of graph.entities) {
    const entityNameLower = entity.name.toLowerCase();
    for (const term of queryTerms) {
      if (entityNameLower.includes(term) || term.includes(entityNameLower)) {
        matchingEntities.add(entity.name);
      }
    }
  }

  if (matchingEntities.size === 0) {
    return chunks;
  }

  // Boost chunks, которые содержат matching entities
  const boosted = chunks.map((chunk) => {
    const textLower = chunk.text.toLowerCase();
    let entityMatches = 0;

    for (const entityName of matchingEntities) {
      if (textLower.includes(entityName.toLowerCase())) {
        entityMatches++;
      }
    }

    if (entityMatches === 0) return chunk;

    // Boost factor пропорционален количеству совпадений
    const boost = Math.min(entityMatches * 0.1, 0.5); // Max 50% boost
    const newScore = chunk.score + boost * boostFactor;

    return {
      ...chunk,
      score: Math.min(newScore, 1.0),
    };
  });

  return boosted;
}
