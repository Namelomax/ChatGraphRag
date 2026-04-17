import { describe, it, expect, beforeEach, vi } from "vitest";
import { getLanguageModel, getTitleModel } from "../lib/ai/providers";
import { createOpenAI } from "@ai-sdk/openai";

describe("AI Providers Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("should get language model for local provider", () => {
    const modelId = "local/qwen3.5-35b-a3b";
    const lmStudioMock = vi.fn().mockReturnValue({ chat: vi.fn() });
    vi.mock("@ai-sdk/openai", () => ({
      createOpenAI: vi.fn().mockReturnValue(lmStudioMock),
    }));

    const result = getLanguageModel(modelId);

    expect(result).toBeDefined();
    expect(createOpenAI).toHaveBeenCalledWith({
      baseURL: expect.stringContaining("1234"),
      apiKey: "lm-studio",
    });
  });

  it("should get language model for OpenRouter provider", () => {
    const modelId = "openrouter/arcee-ai/trinity-large-preview:free";
    const openrouterMock = vi.fn().mockReturnValue({ chat: vi.fn() });
    vi.mock("@ai-sdk/openai", () => ({
      createOpenAI: vi.fn().mockReturnValue(openrouterMock),
    }));

    const result = getLanguageModel(modelId);

    expect(result).toBeDefined();
    expect(createOpenAI).toHaveBeenCalledWith({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: "",
    });
  });

  it("should get language model for gateway", () => {
    const modelId = "some-gateway-model";
    const gatewayMock = vi.fn().mockReturnValue({ languageModel: vi.fn() });
    vi.mock("ai", () => ({
      gateway: gatewayMock,
    }));

    const result = getLanguageModel(modelId);

    expect(result).toBeDefined();
    expect(gatewayMock).toHaveBeenCalled();
  });

  it("should get title model", () => {
    const lmStudioMock = vi.fn().mockReturnValue({ chat: vi.fn() });
    vi.mock("@ai-sdk/openai", () => ({
      createOpenAI: vi.fn().mockReturnValue(lmStudioMock),
    }));

    const result = getTitleModel();

    expect(result).toBeDefined();
    expect(createOpenAI).toHaveBeenCalledWith({
      baseURL: expect.stringContaining("1234"),
      apiKey: "lm-studio",
    });
  });

  it("should handle test environment provider", () => {
    const originalIsTest = process.env.IS_TEST;
    process.env.IS_TEST = "1";

    const testProvider = require("../lib/ai/providers").myProvider;
    expect(testProvider).toBeDefined();

    process.env.IS_TEST = originalIsTest;
  });
});
