import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDocuments, mockEmbeddings } from "../mocks";
import { retriever } from "../lib/rag/retriever";

describe("Retriever Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should retrieve relevant documents based on query", async () => {
    const query = "artificial intelligence";
    const searchEmbeddings = vi.fn().mockResolvedValue(mockEmbeddings);
    const calculateSimilarity = vi.fn().mockReturnValue(0.9);

    const result = await retriever.retrieve(
      query,
      mockDocuments,
      searchEmbeddings,
      calculateSimilarity,
      2
    );

    expect(searchEmbeddings).toHaveBeenCalled();
    expect(calculateSimilarity).toHaveBeenCalled();
    expect(result.length).toBe(2);
    expect(result[0].score).toBeGreaterThan(0);
  });

  it("should handle empty query", async () => {
    const query = "";
    const searchEmbeddings = vi.fn();
    const calculateSimilarity = vi.fn();

    const result = await retriever.retrieve(
      query,
      mockDocuments,
      searchEmbeddings,
      calculateSimilarity,
      2
    );

    expect(searchEmbeddings).not.toHaveBeenCalled();
    expect(calculateSimilarity).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it("should handle no matching documents", async () => {
    const query = "nonexistent topic";
    const searchEmbeddings = vi.fn().mockResolvedValue([]);
    const calculateSimilarity = vi.fn();

    const result = await retriever.retrieve(
      query,
      mockDocuments,
      searchEmbeddings,
      calculateSimilarity,
      2
    );

    expect(searchEmbeddings).toHaveBeenCalled();
    expect(calculateSimilarity).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });
});
