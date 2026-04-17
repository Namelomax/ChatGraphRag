import "server-only";
import type { ArtifactKind } from "@/components/chat/artifact";
import type { VisibilityType } from "@/components/chat/visibility-selector";
import { ChatbotError } from "../errors";
import { generateUUID } from "../utils";
import { generateHashedPassword } from "./utils";

export type User = {
  id: string;
  email: string; // used as username internally
  password?: string | null;
  createdAt?: string;
};

type Chat = {
  id: string;
  createdAt: string;
  title: string;
  userId: string;
  visibility: "public" | "private";
};

export type DBMessage = {
  id: string;
  chatId: string;
  role: string;
  parts: unknown;
  attachments: unknown;
  createdAt: Date;
  userId?: string;
};

export type Suggestion = {
  id: string;
  documentId: string;
  documentCreatedAt: Date;
  originalText: string;
  suggestedText: string;
  description: string | null;
  isResolved: boolean;
  userId: string;
  createdAt: Date;
};

type DocumentRecord = {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string | null;
  userId: string;
  createdAt: Date;
};

const surrealUrl = process.env.SURREAL_HTTP_URL ?? "http://127.0.0.1:8000/sql";
const surrealUser = process.env.SURREAL_USER ?? "root";
const surrealPass = process.env.SURREAL_PASS ?? "secret";
const surrealNamespace = process.env.SURREAL_NS ?? "forus";
const surrealDatabase = process.env.SURREAL_DB ?? "protocoler";

async function surrealQuery<T>(query: string, vars: Record<string, unknown>) {
  const interpolated = query.replace(/\$([a-zA-Z_]\w*)/g, (_, key) =>
    JSON.stringify(vars[key])
  );
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
    throw new ChatbotError("bad_request:database", "SurrealDB query failed");
  }
  const json = (await response.json()) as Array<{ status?: string; result?: unknown; detail?: string }>;
  // SurrealDB returns one entry per statement; skip the USE NS / USE DB entries (index 0 and 1)
  // and check the rest for errors
  for (let i = 2; i < json.length; i++) {
    const entry = json[i];
    if (entry.status && entry.status !== "OK") {
      throw new ChatbotError("bad_request:database", entry.detail ?? "SurrealDB query error");
    }
  }
  // Return only the actual query results (skip USE NS / USE DB results)
  return json.slice(2) as T;
}

export async function getUser(username: string): Promise<User[]> {
  try {
    const result = await surrealQuery<Array<{ result?: User[] }>>(
      "SELECT * FROM user WHERE email = $username LIMIT 1;",
      { username }
    );
    return result[0]?.result ?? [];
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get user by username"
    );
  }
}

export async function createUser(username: string, password: string) {
  const hashedPassword = generateHashedPassword(password);

  try {
    return await surrealQuery(
      "CREATE user CONTENT { email: $username, password: $password, createdAt: time::now() };",
      { username, password: hashedPassword }
    );
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to create user");
  }
}

export async function createGuestUser() {
  const email = `guest-${Date.now()}`;
  const password = generateHashedPassword(generateUUID());

  try {
    const result = await surrealQuery<Array<{ result?: Array<{ id: string; email: string }> }>>(
      "CREATE user CONTENT { email: $email, password: $password, createdAt: time::now() };",
      { email, password }
    );
    const created = result[0]?.result?.[0];
    if (!created) {
      throw new Error("No user created");
    }
    return [{ id: created.id, email: created.email }];
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to create guest user"
    );
  }
}

export async function saveChat({
  id,
  userId,
  title,
  visibility,
}: {
  id: string;
  userId: string;
  title: string;
  visibility: VisibilityType;
}) {
  try {
    // Strip "chat:" prefix to avoid double-wrapping in SurrealDB
    const rawId = id.startsWith("chat:") ? id.slice(5) : id;
    return await surrealQuery(
      "CREATE chat CONTENT { id: $id, createdAt: time::now(), userId: $userId, title: $title, visibility: $visibility };",
      { id: rawId, userId, title, visibility }
    );
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to save chat");
  }
}

export async function deleteChatById({ id }: { id: string }) {
  try {
    const rawId = id.startsWith("chat:") ? id.slice(5) : id;
    const chatIdStr = `chat:${rawId}`;
    await surrealQuery(`DELETE vote WHERE chatId = "${chatIdStr}";`, {});
    await surrealQuery(`DELETE message WHERE chatId = "${chatIdStr}";`, {});
    await surrealQuery(`DELETE stream WHERE chatId = "${chatIdStr}";`, {});
    await surrealQuery(`DELETE rag_chunk WHERE chatId = "${chatIdStr}";`, {});
    const deleted = await surrealQuery<Array<{ result?: Chat[] }>>(
      `DELETE chat:${rawId} RETURN BEFORE;`,
      {}
    );
    return deleted[0]?.result?.[0] ?? null;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete chat by id"
    );
  }
}

export async function deleteAllChatsByUserId({ userId }: { userId: string }) {
  try {
    const chats = await surrealQuery<Array<{ result?: Array<{ id: string }> }>>(
      "SELECT id FROM chat WHERE userId = $userId;",
      { userId }
    );
    const ids = chats[0]?.result?.map((c) => c.id) ?? [];
    for (const id of ids) {
      await deleteChatById({ id });
    }
    return { deletedCount: ids.length };
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete all chats by user id"
    );
  }
}

export async function getChatsByUserId({
  id,
  limit,
  startingAfter,
  endingBefore,
}: {
  id: string;
  limit: number;
  startingAfter: string | null;
  endingBefore: string | null;
}) {
  try {
    const data = await surrealQuery<Array<{ result?: Chat[] }>>(
      "SELECT * FROM chat WHERE userId = $id ORDER BY createdAt DESC;",
      { id }
    );
    const filteredChats = data[0]?.result ?? [];
    const hasMore = filteredChats.length > limit;

    return {
      chats: hasMore ? filteredChats.slice(0, limit) : filteredChats,
      hasMore,
    };
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get chats by user id"
    );
  }
}

export async function getChatById({ id }: { id: string }) {
  try {
    // Strip "chat:" prefix to match SurrealDB record ID
    const rawId = id.startsWith("chat:") ? id.slice(5) : id;
    // Use table:id syntax directly (IDs from generateUUID are safe hex strings)
    const result = await surrealQuery<Array<{ result?: Chat[] }>>(
      `SELECT * FROM chat:${rawId};`,
      {}
    );
    const selectedChat = result[0]?.result?.[0];
    if (!selectedChat) {
      return null;
    }

    return selectedChat;
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to get chat by id");
  }
}

export async function saveMessages({ messages }: { messages: DBMessage[] }) {
  try {
    for (const item of messages) {
      // Ensure chatId is stored with "chat:" prefix for consistent queries
      const rawChatId = item.chatId.startsWith("chat:") ? item.chatId.slice(5) : item.chatId;
      const chatIdStr = `chat:${rawChatId}`;
      
      await surrealQuery(
        "CREATE message CONTENT { id: $id, chatId: $chatId, userId: $userId, role: $role, parts: $parts, attachments: $attachments, createdAt: $createdAt };",
        {
          ...item,
          chatId: chatIdStr,
          userId: item.userId ?? "",
          createdAt: item.createdAt.toISOString(),
        }
      );
    }
    return true;
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to save messages");
  }
}

export async function updateMessage({
  id,
  parts,
}: {
  id: string;
  parts: DBMessage["parts"];
}) {
  try {
    const rawId = id.startsWith("message:") ? id.slice(8) : id;
    return await surrealQuery(
      `UPDATE message:${rawId} SET parts = $parts;`,
      { parts }
    );
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to update message");
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  try {
    const rawId = id.startsWith("chat:") ? id.slice(5) : id;
    const chatIdStr = `chat:${rawId}`;
    const result = await surrealQuery<Array<{ result?: DBMessage[] }>>(
      `SELECT * FROM message WHERE chatId = "${chatIdStr}" ORDER BY createdAt ASC;`,
      {}
    );
    return (result[0]?.result ?? []).map((message) => ({
      ...message,
      createdAt: new Date(message.createdAt),
    }));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get messages by chat id"
    );
  }
}

export async function voteMessage({
  chatId,
  messageId,
  type,
}: {
  chatId: string;
  messageId: string;
  type: "up" | "down";
}) {
  try {
    const rawChatId = chatId.startsWith("chat:") ? chatId.slice(5) : chatId;
    const chatIdStr = `chat:${rawChatId}`;
    return await surrealQuery(
      "UPSERT vote:$id CONTENT { chatId: $chatId, messageId: $messageId, isUpvoted: $isUpvoted };",
      { id: `${rawChatId}-${messageId}`, chatId: chatIdStr, messageId, isUpvoted: type === "up" }
    );
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to vote message");
  }
}

export async function getVotesByChatId({ id }: { id: string }) {
  try {
    const rawId = id.startsWith("chat:") ? id.slice(5) : id;
    const chatIdStr = `chat:${rawId}`;
    const result = await surrealQuery<Array<{ result?: unknown[] }>>(
      `SELECT * FROM vote WHERE chatId = "${chatIdStr}";`,
      {}
    );
    return result[0]?.result ?? [];
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get votes by chat id"
    );
  }
}

export async function saveDocument({
  id,
  title,
  kind,
  content,
  userId,
}: {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  userId: string;
}) {
  try {
    // UPSERT: если документ существует — обновляем, иначе создаём
    return await surrealQuery(
      `UPSERT type::thing('document', $id) CONTENT { 
        id: $id,
        title: $title, 
        kind: $kind, 
        content: $content, 
        userId: $userId, 
        createdAt: time::now() 
      };`,
      { id, title, kind, content, userId }
    );
  } catch (_error) {
    console.error("[saveDocument] Error:", _error);
    throw new ChatbotError("bad_request:database", "Failed to save document");
  }
}

export async function updateDocumentContent({
  id,
  content,
}: {
  id: string;
  content: string;
}) {
  try {
    const docs = await getDocumentsById({ id });
    const latest = docs.at(-1);
    if (!latest) {
      throw new ChatbotError("not_found:database", "Document not found");
    }

    return await surrealQuery(
      "UPDATE document SET content = $content WHERE id = $id;",
      { id, content }
    );
  } catch (_error) {
    if (_error instanceof ChatbotError) {
      throw _error;
    }
    throw new ChatbotError(
      "bad_request:database",
      "Failed to update document content"
    );
  }
}

export async function getDocumentsById({ id }: { id: string }) {
  try {
    const result = await surrealQuery<Array<{ result?: DocumentRecord[] }>>(
      "SELECT * FROM document WHERE id = $id ORDER BY createdAt DESC;",
      { id }
    );
    return (result[0]?.result ?? []).map((doc) => ({
      ...doc,
      createdAt: new Date(doc.createdAt),
    }));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get documents by id"
    );
  }
}

export async function getDocumentById({ id }: { id: string }) {
  try {
    const docs = await getDocumentsById({ id });
    return docs.at(-1);
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get document by id"
    );
  }
}

export async function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
}: {
  id: string;
  timestamp: Date;
}) {
  try {
    await surrealQuery(
      "DELETE suggestion WHERE documentId = $id AND documentCreatedAt > $timestamp;",
      { id, timestamp: timestamp.toISOString() }
    );
    return await surrealQuery(
      "DELETE document WHERE id = $id AND createdAt > $timestamp RETURN BEFORE;",
      { id, timestamp: timestamp.toISOString() }
    );
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete documents by id after timestamp"
    );
  }
}

export async function saveSuggestions({
  suggestions,
}: {
  suggestions: Suggestion[];
}) {
  try {
    for (const item of suggestions) {
      await surrealQuery(
        "CREATE suggestion CONTENT { id: $id, documentId: $documentId, documentCreatedAt: $documentCreatedAt, originalText: $originalText, suggestedText: $suggestedText, description: $description, isResolved: $isResolved, userId: $userId, createdAt: $createdAt };",
        {
          ...item,
          documentCreatedAt: item.documentCreatedAt.toISOString(),
          createdAt: item.createdAt.toISOString(),
        }
      );
    }
    return true;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to save suggestions"
    );
  }
}

export async function getSuggestionsByDocumentId({
  documentId,
}: {
  documentId: string;
}) {
  try {
    const result = await surrealQuery<Array<{ result?: Suggestion[] }>>(
      "SELECT * FROM suggestion WHERE documentId = $documentId;",
      { documentId }
    );
    return result[0]?.result ?? [];
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get suggestions by document id"
    );
  }
}

export async function getMessageById({ id }: { id: string }) {
  try {
    const rawId = id.startsWith("message:") ? id.slice(8) : id;
    const result = await surrealQuery<Array<{ result?: DBMessage[] }>>(
      `SELECT * FROM message:${rawId} LIMIT 1;`,
      {}
    );
    return (result[0]?.result ?? []).map((message) => ({
      ...message,
      createdAt: new Date(message.createdAt),
    }));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get message by id"
    );
  }
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  try {
    const rawId = chatId.startsWith("chat:") ? chatId.slice(5) : chatId;
    const chatIdStr = `chat:${rawId}`;
    await surrealQuery(
      `DELETE vote WHERE chatId = "${chatIdStr}";`,
      {}
    );
    return await surrealQuery(
      `DELETE message WHERE chatId = "${chatIdStr}" AND createdAt >= "${timestamp.toISOString()}";`,
      {}
    );
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete messages by chat id after timestamp"
    );
  }
}

export async function updateChatVisibilityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: "private" | "public";
}) {
  try {
    const rawId = chatId.startsWith("chat:") ? chatId.slice(5) : chatId;
    return await surrealQuery(
      `UPDATE chat:${rawId} SET visibility = "${visibility}";`,
      {}
    );
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to update chat visibility by id"
    );
  }
}

export async function updateChatTitleById({
  chatId,
  title,
}: {
  chatId: string;
  title: string;
}) {
  try {
    const rawId = chatId.startsWith("chat:") ? chatId.slice(5) : chatId;
    await surrealQuery(
      `UPDATE chat:${rawId} SET title = "${title.replace(/"/g, '\\"')}";`,
      {}
    );
  } catch (_error) {
    return;
  }
}

export async function getMessageCountByUserId({
  id,
  differenceInHours,
}: {
  id: string;
  differenceInHours: number;
}) {
  try {
    const cutoffTime = new Date(Date.now() - differenceInHours * 60 * 60 * 1000);
    const result = await surrealQuery<Array<{ result?: Array<{ count: number }> }>>(
      "SELECT count() AS count FROM message WHERE userId = $id AND role = 'user' AND createdAt >= $cutoff;",
      { id, cutoff: cutoffTime.toISOString() }
    );
    return result[0]?.result?.[0]?.count ?? 0;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get message count by user id"
    );
  }
}

export async function createStreamId({
  streamId,
  chatId,
}: {
  streamId: string;
  chatId: string;
}) {
  try {
    const rawId = chatId.startsWith("chat:") ? chatId.slice(5) : chatId;
    const chatIdStr = `chat:${rawId}`;
    await surrealQuery(
      "CREATE stream CONTENT { id: $streamId, chatId: $chatId, createdAt: time::now() };",
      { streamId, chatId: chatIdStr }
    );
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to create stream id"
    );
  }
}

export async function getStreamIdsByChatId({ chatId }: { chatId: string }) {
  try {
    const rawId = chatId.startsWith("chat:") ? chatId.slice(5) : chatId;
    const chatIdStr = `chat:${rawId}`;
    const result = await surrealQuery<Array<{ result?: Array<{ id: string }> }>>(
      `SELECT id FROM stream WHERE chatId = "${chatIdStr}" ORDER BY createdAt ASC;`,
      {}
    );
    return (result[0]?.result ?? []).map(({ id }) => id);
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get stream ids by chat id"
    );
  }
}

async function surrealQuerySafe<T>(query: string, vars: Record<string, unknown>) {
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

function isAlreadyExistsError(json: Array<{ status?: string; detail?: string }>) {
  for (const entry of json) {
    if (entry.status === "ERR") {
      const detail = entry.detail ?? "";
      if (
        detail.includes("AlreadyExists") ||
        detail.includes("already exists")
      ) {
        return true;
      }
    }
  }
  return false;
}

export async function ensureSchema() {
  const tables = [
    "DEFINE TABLE user SCHEMALESS;",
    "DEFINE TABLE chat SCHEMALESS;",
    "DEFINE TABLE message SCHEMALESS;",
    "DEFINE TABLE vote SCHEMALESS;",
    "DEFINE TABLE document SCHEMALESS;",
    "DEFINE TABLE suggestion SCHEMALESS;",
    "DEFINE TABLE stream SCHEMALESS;",
  ];
  for (const stmt of tables) {
    try {
      const json = await surrealQuerySafe(stmt, {});
      if (isAlreadyExistsError(json)) {
        // Table already exists, skip
        continue;
      }
    } catch (error) {
      // Ignore errors during schema creation
    }
  }
}
