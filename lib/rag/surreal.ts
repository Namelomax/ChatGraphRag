const surrealUrl = process.env.SURREAL_HTTP_URL ?? "http://127.0.0.1:8000/sql";
const surrealUser = process.env.SURREAL_USER ?? "root";
const surrealPass = process.env.SURREAL_PASS ?? "secret";
const surrealNamespace = process.env.SURREAL_NS ?? "forus";
const surrealDatabase = process.env.SURREAL_DB ?? "protocoler";

async function surrealQuery<T>(query: string, vars: Record<string, unknown>) {
  const interpolated = query.replace(/\$([a-zA-Z_]\w*)/g, (_, key) => {
    const value = vars[key];
    return JSON.stringify(value);
  });
  // Prepend USE statement to guarantee namespace/database context in SurrealDB 3.x
  const body = `USE NS ${surrealNamespace}; USE DB ${surrealDatabase}; ${interpolated}`;
  const response = await fetch(surrealUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${surrealUser}:${surrealPass}`).toString("base64")}`,
    },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`SurrealDB query failed: ${response.status}`);
  }

  const json = (await response.json()) as Array<{ status?: string; result?: unknown }>;
  // Skip USE NS / USE DB results (index 0 and 1), return actual query results
  return json.slice(2) as T;
}

export async function ensureRagSchema() {
  await surrealQuery(
    `
DEFINE TABLE rag_chunk SCHEMALESS;
DEFINE INDEX rag_chunk_chat_idx ON TABLE rag_chunk COLUMNS chatId;
DEFINE INDEX rag_chunk_user_idx ON TABLE rag_chunk COLUMNS userId;
`,
    {}
  );
}

export async function insertChunk(input: {
  chatId: string;
  userId: string;
  fileName: string;
  text: string;
  embedding: number[];
}) {
  await surrealQuery(
    `
CREATE rag_chunk CONTENT {
  chatId: $chatId,
  userId: $userId,
  fileName: $fileName,
  text: $text,
  embedding: $embedding,
  createdAt: time::now()
};`,
    input
  );
}

export async function getChunksByChat(chatId: string) {
  const result = await surrealQuery<
    Array<{ result?: Array<{ text: string; fileName: string; embedding: number[] }> }>
  >(
    "SELECT text, fileName, embedding FROM rag_chunk WHERE chatId = $chatId;",
    { chatId }
  );
  return result.at(0)?.result ?? [];
}

export async function getDocumentsByChat(chatId: string) {
  const result = await surrealQuery<
    Array<{ result?: Array<{ fileName: string; chunkCount: number; createdAt: string }> }>
  >(
    `SELECT fileName, count() as chunkCount, time::min(createdAt) as createdAt 
     FROM rag_chunk 
     WHERE chatId = $chatId 
     GROUP BY fileName;`,
    { chatId }
  );
  return result.at(0)?.result ?? [];
}

export async function deleteDocumentFromRag({ chatId, fileName }: { chatId: string; fileName: string }) {
  await surrealQuery(
    "DELETE FROM rag_chunk WHERE chatId = $chatId AND fileName = $fileName;",
    { chatId, fileName }
  );
}

// Adapter that provides a .query() interface compatible with indexer.ts and retriever.ts
export async function getSurreal() {
  return {
    query: async <T>(sql: string, vars: Record<string, unknown> = {}): Promise<T> => {
      return surrealQuery<T>(sql, vars);
    },
  };
}
