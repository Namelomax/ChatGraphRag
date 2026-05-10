/**
 * RAG Service Integration
 * Handles document upload and processing to the Python RAG backend
 */

const RAG_API_URL =
  process.env.RAG_API_URL ||
  process.env.NEXT_PUBLIC_RAG_API_URL ||
  "http://localhost:8000";

interface RAGResponse {
  message: string;
  filename: string;
  status: string;
}

export type UploadDocumentToRAGOptions = {
  /** Wait until ingest completes (blocks HTTP until rag-api finishes MinerU + LightRAG insert). */
  waitUntilIndexed?: boolean;
};

function ragUploadErrorMessage(payload: unknown): string {
  if (typeof payload === "object" && payload !== null && "detail" in payload) {
    const detail = (payload as { detail: unknown }).detail;
    if (typeof detail === "string") {
      return detail;
    }
    if (Array.isArray(detail)) {
      return JSON.stringify(detail);
    }
  }
  return "Failed to process document in RAG";
}

export async function uploadDocumentToRAG(
  file: File,
  options?: UploadDocumentToRAGOptions
): Promise<RAGResponse> {
  try {
    const formData = new FormData();
    formData.append("file", file);

    const query = options?.waitUntilIndexed === true ? "?wait=true" : "";

    const response = await fetch(`${RAG_API_URL}/upload${query}`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      let message = "Failed to process document in RAG";
      try {
        const errorPayload = (await response.json()) as unknown;
        message = ragUploadErrorMessage(errorPayload);
      } catch {
        /* non-JSON error body */
      }
      throw new Error(message);
    }

    const data = (await response.json()) as RAGResponse;
    if (options?.waitUntilIndexed === true && data.status !== "indexed") {
      throw new Error(
        data.message ||
          "RAG вернул успех, но индексация не завершена (ожидался status=indexed)"
      );
    }
    return data;
  } catch (error) {
    console.error("RAG Service Error:", error);
    throw error;
  }
}

interface QueryResponse {
  answer: string;
  status: string;
}

export async function queryRAG(
  question: string,
  mode: "hybrid" | "local" | "global" = "hybrid"
): Promise<QueryResponse> {
  try {
    const response = await fetch(`${RAG_API_URL}/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ question, mode }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to query RAG");
    }

    const data: QueryResponse = await response.json();
    return data;
  } catch (error) {
    console.error("RAG Query Error:", error);
    throw error;
  }
}

export async function checkRAGHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${RAG_API_URL}/health`);
    return response.ok;
  } catch (_error) {
    return false;
  }
}
