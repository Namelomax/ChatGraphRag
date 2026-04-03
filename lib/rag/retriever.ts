import { ragConfig } from "./config";
import { cosineSimilarity, embedTexts } from "./embeddings";
import { getSurreal } from "./surreal";

type RagChunk = {
  id: string;
  content: string;
  embedding: number[];
  documentId: string;
};

export async function retrieveContext({
  userId,
  query,
  limit = ragConfig.retrievalTopK,
}: {
  userId: string;
  query: string;
  limit?: number;
}) {
  const queryEmbedding = (await embedTexts([query]))[0];
  if (!queryEmbedding) {
    return [];
  }

  const db = await getSurreal();
  const rows = (await db.query(
    "SELECT id, content, embedding, documentId FROM rag_chunk WHERE userId = $userId LIMIT 500",
    { userId }
  )) as Array<{ result?: RagChunk[] }>;

  const chunks = rows[0]?.result ?? [];
  return chunks
    .map((chunk) => ({
      ...chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
