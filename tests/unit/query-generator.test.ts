import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockChat } from "../mocks";
import { queryGenerator } from "../lib/rag/query-generator";

describe("Query Generator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should generate query from user message", () => {
    const query = queryGenerator.generateQuery(mockChat.messages[0].content);

    expect(query).toBeDefined();
    expect(typeof query).toBe("string");
    expect(query.length).toBeGreaterThan(0);
  });

  it("should handle empty message", () => {
    const query = queryGenerator.generateQuery("");

    expect(query).toBe("");
  });

  it("should generate query from chat context", () => {
    const query = queryGenerator.generateQueryFromContext(
      mockChat.messages,
      mockChat.context
    );

    expect(query).toBeDefined();
    expect(typeof query).toBe("string");
    expect(query.length).toBeGreaterThan(0);
  });

  it("should handle empty context", () => {
    const query = queryGenerator.generateQueryFromContext(
      mockChat.messages,
      []
    );

    expect(query).toBeDefined();
    expect(typeof query).toBe("string");
  });
});
