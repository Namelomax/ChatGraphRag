import { createHash } from "node:crypto";
import { chunkText } from "./chunker";
import { ragConfig } from "./config";
import { embedTexts } from "./embeddings";
import { getSurreal } from "./surreal";

function contentHash(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

export async function indexDocumentForUser({
  userId,
  fileName,
  fileUrl,
  contentType,
  text,
}: {
  userId: string;
  fileName: string;
  fileUrl: string;
  contentType: string;
  text: string;
}) {
  const normalized = text.trim();
  if (!normalized) {
    return null;
  }

  const hash = contentHash(normalized);
  const db = await getSurreal();
  const existing = (await db.query(
    "SELECT id FROM rag_document WHERE userId = $userId AND contentHash = $contentHash LIMIT 1",
    { userId, contentHash: hash }
  )) as Array<{ result?: Array<{ id: string }> }>;

  if (existing[0]?.result?.length) {
    return existing[0].result[0].id;
  }

  const documentId = `rag_document:${crypto.randomUUID()}`;
  await db.query(
    "CREATE type::thing('rag_document', $id) CONTENT { userId: $userId, fileName: $fileName, fileUrl: $fileUrl, contentType: $contentType, contentHash: $contentHash, createdAt: time::now() }",
    {
      id: documentId.split(":")[1],
      userId,
      fileName,
      fileUrl,
      contentType,
      contentHash: hash,
    }
  );

  const chunks = chunkText(normalized, ragConfig.chunkSize, ragConfig.overlap);
  const vectors = await embedTexts(chunks);

  for (const [index, chunk] of chunks.entries()) {
    const chunkId = `rag_chunk:${crypto.randomUUID()}`;
    await db.query(
      "CREATE type::thing('rag_chunk', $id) CONTENT { userId: $userId, documentId: $documentId, idx: $idx, content: $content, embedding: $embedding, createdAt: time::now() }",
      {
        id: chunkId.split(":")[1],
        userId,
        documentId,
        idx: index,
        content: chunk,
        embedding: vectors[index],
      }
    );
    await db.query("RELATE $documentId->contains->$chunkId", {
      documentId,
      chunkId,
    });
  }

  return documentId;
}
