import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  cn,
  fetcher,
  fetchWithErrorHandlers,
  generateUUID,
  getDocumentTimestampByIndex,
  sanitizeText,
  convertToUIMessages,
  getTextFromMessage,
} from "../lib/utils";

describe("Utility Functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should combine class names", () => {
    const result = cn("class1", "class2", { class3: true }, { class4: false });

    expect(result).toBeDefined();
    expect(typeof result).toBe("string");
    expect(result).toContain("class1");
    expect(result).toContain("class2");
    expect(result).toContain("class3");
    expect(result).not.toContain("class4");
  });

  it("should fetch data from URL", async () => {
    const mockResponse = { data: "test" };
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockResponse),
    } as Response);

    const result = await fetcher("https://test.com/api");

    expect(result).toBeDefined();
    expect(result).toEqual(mockResponse);
  });

  it("should handle fetch errors", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      json: vi
        .fn()
        .mockResolvedValue({ code: "test_error", cause: "Test cause" }),
    } as Response);

    await expect(fetcher("https://test.com/api")).rejects.toThrow();
  });

  it("should fetch with error handlers", async () => {
    const mockResponse = { data: "test" };
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockResponse),
    } as Response);

    const result = await fetchWithErrorHandlers("https://test.com/api");

    expect(result).toBeDefined();
    expect(result.ok).toBe(true);
  });

  it("should handle fetch errors with error handlers", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      json: vi
        .fn()
        .mockResolvedValue({ code: "test_error", cause: "Test cause" }),
    } as Response);

    await expect(
      fetchWithErrorHandlers("https://test.com/api")
    ).rejects.toThrow();
  });

  it("should generate UUID", () => {
    const uuid = generateUUID();

    expect(uuid).toBeDefined();
    expect(typeof uuid).toBe("string");
    expect(uuid.length).toBe(32);
    expect(uuid).toMatch(/^[a-f0-9]{32}$/);
  });

  it("should get document timestamp by index", () => {
    const documents = [
      {
        id: "1",
        title: "Doc 1",
        content: "Content",
        createdAt: new Date("2024-01-01"),
      },
      {
        id: "2",
        title: "Doc 2",
        content: "Content",
        createdAt: new Date("2024-01-02"),
      },
    ];

    const timestamp = getDocumentTimestampByIndex(documents, 1);

    expect(timestamp).toBeDefined();
    expect(timestamp).toBeInstanceOf(Date);
    expect(timestamp.toISOString()).toBe("2024-01-02T00:00:00.000Z");
  });

  it("should sanitize text", () => {
    const text = "This is a <has_function_call> test";
    const sanitized = sanitizeText(text);

    expect(sanitized).toBeDefined();
    expect(sanitized).toBe("This is a  test");
  });

  it("should convert DB messages to UI messages", () => {
    const dbMessages = [
      {
        id: "msg-1",
        chatId: "chat-1",
        role: "user",
        parts: [{ type: "text", text: "Hello" }],
        attachments: [],
        createdAt: new Date("2024-01-01"),
      },
    ];

    const uiMessages = convertToUIMessages(dbMessages);

    expect(uiMessages).toBeDefined();
    expect(Array.isArray(uiMessages)).toBe(true);
    expect(uiMessages.length).toBe(1);
    expect(uiMessages[0].id).toBe("msg-1");
    expect(uiMessages[0].role).toBe("user");
    expect(uiMessages[0].parts.length).toBe(1);
    expect(uiMessages[0].metadata.createdAt).toBeDefined();
  });

  it("should get text from message", () => {
    const message = {
      parts: [
        { type: "text", text: "Hello" },
        { type: "text", text: " " },
        { type: "text", text: "world" },
      ],
    };

    const text = getTextFromMessage(message);

    expect(text).toBeDefined();
    expect(text).toBe("Hello world");
  });
});
