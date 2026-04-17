import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDocuments, mockEmbeddings } from "../mocks";
import { embeddings } from "../lib/rag/embeddings";

describe("Embeddings Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should generate embeddings for documents", async () => {
    const generateEmbeddings = vi.fn();

    const result = await embeddings.generateEmbeddings(
      mockDocuments,
      generateEmbeddings
    );

    expect(generateEmbeddings).toHaveBeenCalled();
    expect(result.length).toBe(3);
    expect(result[0].documentId).toBe("doc-1");
    expect(result[0].embedding.length).toBeGreaterThan(0);
  });

  it("should handle empty document array", async () => {
    const generateEmbeddings = vi.fn();

    const result = await embeddings.generateEmbeddings([], generateEmbeddings);

    expect(generateEmbeddings).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it("should calculate similarity between embeddings", () => {
    const similarity = embeddings.calculateSimilarity(
      mockEmbeddings[0].embedding,
      mockEmbeddings[1].embedding
    );

    expect(similarity).toBeDefined();
    expect(typeof similarity).toBe("number");
  });

  it("should handle empty embeddings", () => {
    const similarity = embeddings.calculateSimilarity([], []);

    expect(similarity).toBe(0);
  });
});
