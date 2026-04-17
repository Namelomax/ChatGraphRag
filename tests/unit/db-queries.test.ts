import { describe, it, expect, beforeEach, vi } from "vitest";
import { getUser, createUser, createGuestUser } from "../lib/db/queries";

describe("Database User Queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should get user by username", async () => {
    const username = "test@example.com";
    const surrealQueryMock = vi
      .fn()
      .mockResolvedValue([{ result: [{ id: "user-1", email: username }] }]);

    const result = await getUser(username);

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].email).toBe(username);
  });

  it("should create new user", async () => {
    const username = "newuser@example.com";
    const password = "password123";
    const surrealQueryMock = vi.fn().mockResolvedValue([{}]);

    const result = await createUser(username, password);

    expect(result).toBeDefined();
    expect(surrealQueryMock).toHaveBeenCalled();
  });

  it("should create guest user", async () => {
    const surrealQueryMock = vi
      .fn()
      .mockResolvedValue([
        { result: [{ id: "guest-1", email: "guest-123456" }] },
      ]);

    const result = await createGuestUser();

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
    expect(result[0].email).toContain("guest-");
  });

  it("should handle database errors gracefully", async () => {
    const username = "test@example.com";
    const surrealQueryMock = vi
      .fn()
      .mockRejectedValue(new Error("Database error"));

    await expect(getUser(username)).rejects.toThrow();
  });
});
