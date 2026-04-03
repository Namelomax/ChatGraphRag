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
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel(modelId);
  }

  if (process.env.USE_LOCAL_LLM === "1") {
    const lmStudio = createOpenAI({
      baseURL: process.env.LOCAL_LLM_BASE_URL ?? "http://127.0.0.1:1234/v1",
      apiKey: process.env.LOCAL_LLM_API_KEY ?? "lm-studio",
    });
    // Extract model name from id (e.g., "local/qwen3.5-35b-a3b" -> "qwen/qwen3.5-35b-a3b")
    const modelName = modelId.replace("local/", "");
    return lmStudio.chat(
      process.env.LOCAL_LLM_MODEL ?? modelName
    );
  }

  return gateway.languageModel(modelId);
}

export function getTitleModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("title-model");
  }
  if (process.env.USE_LOCAL_LLM === "1") {
    const lmStudio = createOpenAI({
      baseURL: process.env.LOCAL_LLM_BASE_URL ?? "http://127.0.0.1:1234/v1",
      apiKey: process.env.LOCAL_LLM_API_KEY ?? "lm-studio",
    });
    return lmStudio.chat(
      process.env.LOCAL_TITLE_MODEL ??
        process.env.LOCAL_LLM_MODEL ??
        "qwen/qwen3.5-35b-a3b"
    );
  }
  return gateway.languageModel(titleModel.id);
}
