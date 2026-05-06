import { createOpenAI } from "@ai-sdk/openai";
import { customProvider, gateway } from "ai";
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

const localBaseURL = process.env.LOCAL_OPENAI_BASE_URL;
const localApiKey = process.env.LOCAL_OPENAI_API_KEY ?? "lm-studio";
const useLocalProvider = Boolean(localBaseURL);

const localProvider = useLocalProvider
  ? createOpenAI({
      baseURL: localBaseURL,
      apiKey: localApiKey,
    })
  : null;

export const isGatewayProviderEnabled = !useLocalProvider;

export function getLanguageModel(modelId: string) {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel(modelId);
  }

  if (localProvider) {
    return localProvider.chat(modelId);
  }

  return gateway.languageModel(modelId);
}

export function getTitleModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("title-model");
  }

  if (localProvider) {
    return localProvider.chat(titleModel.id);
  }

  return gateway.languageModel(titleModel.id);
}
