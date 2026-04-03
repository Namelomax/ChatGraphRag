export const ragConfig = {
  surreal: {
    url: process.env.SURREALDB_URL ?? "http://127.0.0.1:8000/rpc",
    namespace: process.env.SURREALDB_NAMESPACE ?? "forus",
    database: process.env.SURREALDB_DATABASE ?? "protocols",
    username: process.env.SURREALDB_USER ?? "root",
    password: process.env.SURREALDB_PASS ?? "secret",
  },
  llm: {
    baseUrl: process.env.LOCAL_LLM_BASE_URL ?? "http://127.0.0.1:1234/v1",
    model: process.env.LOCAL_LLM_MODEL ?? "qwen/qwen3.5-35b-a3b",
    embeddingModel:
      process.env.LOCAL_EMBEDDING_MODEL ?? "text-embedding-nomic-embed-text-v1.5",
  },
  chunkSize: Number(process.env.RAG_CHUNK_SIZE ?? 1200),
  overlap: Number(process.env.RAG_CHUNK_OVERLAP ?? 120),
  retrievalTopK: Number(process.env.RAG_TOP_K ?? 6),
};
