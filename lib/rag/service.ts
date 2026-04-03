import { embedText, cosineSimilarity } from "./embeddings";
import { splitText } from "./chunker";
import { ensureRagSchema, getChunksByChat, insertChunk } from "./surreal";

export async function indexDocumentToGraphRag(input: {
  chatId: string;
  userId: string;
  fileName: string;
  text: string;
}) {
  const chunks = splitText(input.text);
  if (chunks.length === 0) {
    return 0;
  }

  await ensureRagSchema();

  for (const chunk of chunks) {
    const embedding = await embedText(chunk);
    await insertChunk({
      chatId: input.chatId,
      userId: input.userId,
      fileName: input.fileName,
      text: chunk,
      embedding,
    });
  }

  return chunks.length;
}

export async function retrieveRagContext(params: {
  chatId: string;
  query: string;
  topK?: number;
}) {
  const topK = params.topK ?? 6;
  const [queryEmbedding, chunks] = await Promise.all([
    embedText(params.query),
    getChunksByChat(params.chatId),
  ]);

  if (chunks.length === 0) {
    return "";
  }

  const ranked = chunks
    .map((chunk) => ({
      ...chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return ranked
    .map(
      (chunk, index) =>
        `[Context ${index + 1} | ${chunk.fileName}]\n${chunk.text.trim()}`
    )
    .join("\n\n");
}
