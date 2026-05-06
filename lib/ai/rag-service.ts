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

export async function uploadDocumentToRAG(file: File): Promise<RAGResponse> {
  try {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`${RAG_API_URL}/upload`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to process document in RAG");
    }

    const data: RAGResponse = await response.json();
    return data;
  } catch (error) {
    console.error("RAG Service Error:", error);
    throw error;
  }
}

interface QueryRequest {
  question: string;
  mode?: "hybrid" | "local" | "global";
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
