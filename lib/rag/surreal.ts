const surrealUrl = process.env.SURREAL_HTTP_URL ?? "http://127.0.0.1:8000/sql";
const surrealUser = process.env.SURREAL_USER ?? "root";
const surrealPass = process.env.SURREAL_PASS ?? "secret";
const surrealNamespace = process.env.SURREAL_NS ?? "forus";
const surrealDatabase = process.env.SURREAL_DB ?? "protocoler";

export async function surrealQuery<T>(query: string, vars: Record<string, unknown>) {
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

export async function surrealQuerySafe(query: string, vars: Record<string, unknown> = {}) {
  const interpolated = query.replace(/\$([a-zA-Z_]\w*)/g, (_, key) =>
    JSON.stringify(vars[key])
  );
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
  return (await response.json()) as Array<{ status?: string; result?: unknown; detail?: string }>;
}

export async function ensureRagSchema() {
  const statements = [
    `DEFINE TABLE rag_chunk SCHEMALESS;`,
    `DEFINE INDEX rag_chunk_chat_idx ON TABLE rag_chunk COLUMNS chatId;`,
    `DEFINE INDEX rag_chunk_user_idx ON TABLE rag_chunk COLUMNS userId;`,
    // Векторный индекс для ANN поиска (SurrealDB 2.1+)
    `DEFINE VECTOR INDEX rag_chunk_embedding_idx ON TABLE rag_chunk COLUMNS embedding MTREE DIMENSIONS 768 DISTANCE COSINE;`,
  ];
  for (const stmt of statements) {
    try {
      const json = await surrealQuerySafe(stmt, {});
      // Check for AlreadyExists
      for (const entry of json) {
        if (entry.status === "ERR") {
          const detail = entry.detail ?? "";
          if (detail.includes("AlreadyExists") || detail.includes("already exists")) {
            // Already exists, skip
            break;
          }
        }
      }
    } catch (_error) {
      // Ignore errors during schema creation
    }
  }
}

export async function insertChunk(input: {
  chatId: string;
  userId: string;
  fileName: string;
  text: string;
  embedding: number[];
}) {
  // Ensure chatId is stored as a full string with prefix
  const rawChatId = input.chatId.startsWith("chat:") ? input.chatId.slice(5) : input.chatId;
  const chatIdStr = `chat:${rawChatId}`;

  const result = await surrealQuery<
    Array<{ result?: Array<{ id: string }> }>
  >(
    `CREATE rag_chunk CONTENT {
      chatId: "${chatIdStr}",
      userId: $userId,
      fileName: $fileName,
      text: $text,
      embedding: $embedding,
      createdAt: time::now()
    };`,
    { ...input, chatId: chatIdStr }
  );

  return result.at(0)?.result?.at(0);
}

export async function getChunksByChat(chatId: string) {
  const rawId = chatId.startsWith("chat:") ? chatId.slice(5) : chatId;
  const chatIdStr = `chat:${rawId}`;
  const result = await surrealQuery<
    Array<{ result?: Array<{ text: string; fileName: string; embedding: number[] }> }>
  >(
    `SELECT text, fileName, embedding FROM rag_chunk WHERE chatId = "${chatIdStr}";`,
    {}
  );
  return result.at(0)?.result ?? [];
}

export async function getChunksByUser(userId: string) {
  const rawUserId = userId.startsWith("user:") ? userId.slice(5) : userId;
  const userIdStr = `user:${rawUserId}`;
  const result = await surrealQuery<
    Array<{ result?: Array<{ text: string; fileName: string; embedding: number[]; chatId: string; createdAt: string }> }>
  >(
    `SELECT text, fileName, embedding, chatId, createdAt FROM rag_chunk WHERE userId = "${userIdStr}" ORDER BY createdAt DESC;`,
    {}
  );
  return result.at(0)?.result ?? [];
}

export async function getDocumentsByChat(chatId: string) {
  const rawId = chatId.startsWith("chat:") ? chatId.slice(5) : chatId;
  const chatIdStr = `chat:${rawId}`;
  
  console.log(`[getDocumentsByChat] chatId=${chatId}, chatIdStr=${chatIdStr}`);
  
  const result = await surrealQuery<
    Array<{ result?: Array<{ fileName: string; chunkCount: number; createdAt: string }> }>
  >(
    `SELECT fileName, count() as chunkCount, time::min(createdAt) as createdAt
     FROM rag_chunk
     WHERE chatId = "${chatIdStr}"
     GROUP BY fileName;`,
    {}
  );
  
  const documents = result.at(0)?.result ?? [];
  console.log(`[getDocumentsByChat] Returning ${documents.length} documents:`, documents);
  return documents;
}

export async function deleteDocumentFromRag({ chatId, fileName }: { chatId: string; fileName: string }) {
  const rawId = chatId.startsWith("chat:") ? chatId.slice(5) : chatId;
  const chatIdStr = `chat:${rawId}`;
  await surrealQuery(
    `DELETE FROM rag_chunk WHERE chatId = "${chatIdStr}" AND fileName = "${fileName.replace(/"/g, '\\"')}";`,
    {}
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
