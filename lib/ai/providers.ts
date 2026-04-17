import { customProvider, gateway } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { isTestEnvironment } from "../constants";
import { titleModel } from "./models";

export const myProvider = isTestEnvironment
  ? (() => {
      const { chatModel, titleModel } = require("./models.mock");
      return customProvider({
        languageModels: {
          "chat-model": chatModel,
          "title-model": titleModel,
        },
      });
    })()
  : null;

export function getLanguageModel(modelId: string) {
  console.log(`[getLanguageModel] Requested modelId: ${modelId}`);
  
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel(modelId);
  }

  // OpenRouter models - check BEFORE local LLM override
  if (modelId.startsWith("openrouter/")) {
    const openrouterModel = modelId.replace("openrouter/", "");
    console.log(`[getLanguageModel] Using OpenRouter: ${openrouterModel}`);
    const openrouter = createOpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY ?? "",
      headers: { "X-Title": "AISDK" },
    });
    return openrouter.chat(openrouterModel);
  }

  // Local LM Studio - only for "local/" prefixed models
  if (modelId.startsWith("local/")) {
    const lmStudio = createOpenAI({
      baseURL: process.env.LOCAL_LLM_BASE_URL ?? "http://127.0.0.1:1234/v1",
      apiKey: process.env.LOCAL_LLM_API_KEY ?? "lm-studio",
    });
    // Extract model name from id (e.g., "local/qwen3.5-35b-a3b" -> "qwen/qwen3.5-35b-a3b")
    const modelName = modelId.replace("local/", "");
    console.log(`[getLanguageModel] Using LM Studio: ${modelName}`);
    return lmStudio.chat(modelName);
  }

  console.log(`[getLanguageModel] Using gateway: ${modelId}`);
  return gateway.languageModel(modelId);
}

export function getTitleModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("title-model");
  }
  // Title model always uses local
  const lmStudio = createOpenAI({
    baseURL: process.env.LOCAL_LLM_BASE_URL ?? "http://127.0.0.1:1234/v1",
    apiKey: process.env.LOCAL_LLM_API_KEY ?? "lm-studio",
  });
  const modelName = process.env.LOCAL_TITLE_MODEL ??
    process.env.LOCAL_LLM_MODEL ??
    "qwen/qwen3.5-35b-a3b";
  return lmStudio.chat(modelName);
}
