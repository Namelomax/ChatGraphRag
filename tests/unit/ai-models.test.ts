import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  chatModels,
  getCapabilities,
  getActiveModels,
  modelsByProvider,
  allowedModelIds,
} from "../lib/ai/models";

describe("AI Models Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should have predefined chat models", () => {
    expect(chatModels).toBeDefined();
    expect(Array.isArray(chatModels)).toBe(true);
    expect(chatModels.length).toBeGreaterThan(0);

    const localModel = chatModels.find((m) => m.id.includes("local"));
    expect(localModel).toBeDefined();
    expect(localModel?.provider).toBe("local");

    const openrouterModel = chatModels.find((m) => m.id.includes("openrouter"));
    expect(openrouterModel).toBeDefined();
    expect(openrouterModel?.provider).toBe("openrouter");
  });

  it("should get model capabilities", async () => {
    const capabilities = await getCapabilities();

    expect(capabilities).toBeDefined();
    expect(typeof capabilities).toBe("object");
    expect(Object.keys(capabilities).length).toBe(chatModels.length);

    const localModelCapabilities = capabilities["local/qwen3.5-35b-a3b"];
    expect(localModelCapabilities).toBeDefined();
    expect(localModelCapabilities.tools).toBe(true);
    expect(localModelCapabilities.vision).toBe(true);
    expect(localModelCapabilities.reasoning).toBe(false);
  });

  it("should get active models", () => {
    const activeModels = getActiveModels();

    expect(activeModels).toBeDefined();
    expect(Array.isArray(activeModels)).toBe(true);
    expect(activeModels.length).toBe(chatModels.length);
  });

  it("should group models by provider", () => {
    expect(modelsByProvider).toBeDefined();
    expect(typeof modelsByProvider).toBe("object");

    expect(modelsByProvider.local).toBeDefined();
    expect(Array.isArray(modelsByProvider.local)).toBe(true);
    expect(modelsByProvider.local.length).toBeGreaterThan(0);

    expect(modelsByProvider.openrouter).toBeDefined();
    expect(Array.isArray(modelsByProvider.openrouter)).toBe(true);
    expect(modelsByProvider.openrouter.length).toBeGreaterThan(0);
  });

  it("should have allowed model IDs set", () => {
    expect(allowedModelIds).toBeDefined();
    expect(allowedModelIds instanceof Set).toBe(true);
    expect(allowedModelIds.size).toBe(chatModels.length);

    chatModels.forEach((model) => {
      expect(allowedModelIds.has(model.id)).toBe(true);
    });
  });
});
