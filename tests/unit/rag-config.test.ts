import { describe, it, expect, beforeEach, vi } from "vitest";
import { ragConfig } from "../lib/rag/config";

describe("RAG Configuration", () => {
  it("should have default configuration values", () => {
    expect(ragConfig.surreal.url).toBe("http://127.0.0.1:8000/rpc");
    expect(ragConfig.surreal.namespace).toBe("forus");
    expect(ragConfig.surreal.database).toBe("protocols");
    expect(ragConfig.surreal.username).toBe("root");
    expect(ragConfig.surreal.password).toBe("secret");
    expect(ragConfig.llm.baseUrl).toBe("http://127.0.0.1:1234/v1");
    expect(ragConfig.llm.model).toBe("qwen/qwen3.5-35b-a3b");
    expect(ragConfig.llm.embeddingModel).toBe(
      "text-embedding-nomic-embed-text-v1.5"
    );
    expect(ragConfig.chunkSize).toBe(150);
    expect(ragConfig.overlap).toBe(40);
    expect(ragConfig.retrievalTopK).toBe(30);
  });

  it("should allow environment variable overrides", () => {
    const originalEnv = process.env;

    process.env.SURREALDB_URL = "http://custom.url/rpc";
    process.env.SURREALDB_NAMESPACE = "custom-namespace";
    process.env.SURREALDB_DATABASE = "custom-db";
    process.env.SURREALDB_USER = "custom-user";
    process.env.SURREALDB_PASS = "custom-pass";
    process.env.LOCAL_LLM_BASE_URL = "http://custom.llm.url/v1";
    process.env.LOCAL_LLM_MODEL = "custom-model";
    process.env.LOCAL_EMBEDDING_MODEL = "custom-embedding";
    process.env.RAG_CHUNK_SIZE = "200";
    process.env.RAG_CHUNK_OVERLAP = "50";
    process.env.RAG_TOP_K = "40";

    const config = require("../lib/rag/config");

    expect(config.ragConfig.surreal.url).toBe("http://custom.url/rpc");
    expect(config.ragConfig.surreal.namespace).toBe("custom-namespace");
    expect(config.ragConfig.surreal.database).toBe("custom-db");
    expect(config.ragConfig.surreal.username).toBe("custom-user");
    expect(config.ragConfig.surreal.password).toBe("custom-pass");
    expect(config.ragConfig.llm.baseUrl).toBe("http://custom.llm.url/v1");
    expect(config.ragConfig.llm.model).toBe("custom-model");
    expect(config.ragConfig.llm.embeddingModel).toBe("custom-embedding");
    expect(config.ragConfig.chunkSize).toBe(200);
    expect(config.ragConfig.overlap).toBe(50);
    expect(config.ragConfig.retrievalTopK).toBe(40);

    process.env = originalEnv;
  });
});
