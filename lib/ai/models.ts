export const DEFAULT_CHAT_MODEL = "local/qwen3.5-35b-a3b";

export const titleModel = {
  id: "local/qwen3.5-35b-a3b",
  name: "Qwen 3.5 35B A3B",
  provider: "local",
  description: "Local model for title generation",
};

export type ModelCapabilities = {
  tools: boolean;
  vision: boolean;
  reasoning: boolean;
};

export type ChatModel = {
  id: string;
  name: string;
  provider: string;
  description: string;
  gatewayOrder?: string[];
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high";
};

export const chatModels: ChatModel[] = [
  {
    id: "local/qwen3.5-35b-a3b",
    name: "Qwen 3.5 35B A3B",
    provider: "local",
    description: "Local LM Studio model",
  },
  {
    id: "openrouter/arcee-ai/trinity-large-preview:free",
    name: "Trinity Large (OpenRouter)",
    provider: "openrouter",
    description: "Arcee AI Trinity via OpenRouter (free)",
  },
];

export async function getCapabilities(): Promise<
  Record<string, ModelCapabilities>
> {
  return Object.fromEntries(
    chatModels.map((model) => [
      model.id,
      { tools: true, vision: true, reasoning: false },
    ])
  );
}

export const isDemo = process.env.IS_DEMO === "1";

type GatewayModel = {
  id: string;
  name: string;
  type?: string;
  tags?: string[];
};

export type GatewayModelWithCapabilities = ChatModel & {
  capabilities: ModelCapabilities;
};

export async function getAllGatewayModels(): Promise<
  GatewayModelWithCapabilities[]
> {
  return [];
}

export function getActiveModels(): ChatModel[] {
  return chatModels;
}

export const allowedModelIds = new Set(chatModels.map((m) => m.id));

export const modelsByProvider = chatModels.reduce(
  (acc, model) => {
    if (!acc[model.provider]) {
      acc[model.provider] = [];
    }
    acc[model.provider].push(model);
    return acc;
  },
  {} as Record<string, ChatModel[]>
);
