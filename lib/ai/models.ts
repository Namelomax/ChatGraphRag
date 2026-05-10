const localModelId =
  process.env.NEXT_PUBLIC_LOCAL_OPENAI_MODEL ??
  process.env.LOCAL_OPENAI_MODEL ??
  "qwen/qwen3.5-35b-a3b";

/** Вторая модель в селекторе (Ollama: `ollama run qwen3.6:27b`). Имя должно совпадать с API `/v1/chat/completions`. */
export const LOCAL_SECONDARY_CHAT_MODEL_ID = "qwen3.6:27b";

const isLocalProvider = Boolean(
  process.env.NEXT_PUBLIC_LOCAL_OPENAI_MODEL ??
    process.env.LOCAL_OPENAI_BASE_URL
);
export const isLocalProviderEnabled = isLocalProvider;

function formatPrimaryLocalModelDisplayName(modelId: string): string {
  const lower = modelId.toLowerCase();
  if (lower.includes("qwen3.5") && lower.includes("35")) {
    return "Qwen 3.5 35B";
  }
  if (lower.includes("qwen3.6") && lower.includes("27")) {
    return "Qwen 3.6 27B";
  }
  const tail = modelId.includes("/") ? modelId.split("/").pop() : modelId;
  return tail ?? modelId;
}

export const DEFAULT_CHAT_MODEL = isLocalProvider
  ? localModelId
  : "moonshotai/kimi-k2.5";

export const titleModel = {
  id: localModelId,
  name: "Local Title Model",
  provider: "local",
  description: "Local model for title generation",
  gatewayOrder: ["qwen/qwen3.5-14b"],
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

export const chatModels: ChatModel[] = isLocalProvider
  ? [
      {
        id: localModelId,
        name: formatPrimaryLocalModelDisplayName(localModelId),
        provider: "local",
        description:
          "Модель из LOCAL_OPENAI_MODEL / NEXT_PUBLIC_LOCAL_OPENAI_MODEL",
      },
      ...(localModelId === LOCAL_SECONDARY_CHAT_MODEL_ID
        ? []
        : [
            {
              id: LOCAL_SECONDARY_CHAT_MODEL_ID,
              name: "Qwen 3.6 27B",
              provider: "local",
              description:
                "Qwen 3.6 27B (Ollama). Запуск: ollama run qwen3.6:27b",
            },
          ]),
    ]
  : [
      {
        id: localModelId,
        name: "Local LM Studio",
        provider: "local",
        description: "Local OpenAI-compatible model",
      },
    ];

export async function getCapabilities(): Promise<
  Record<string, ModelCapabilities>
> {
  if (isLocalProvider) {
    const localToolsEnabled =
      process.env.LOCAL_OPENAI_TOOLS_ENABLED?.toLowerCase() !== "false";
    return Object.fromEntries(
      chatModels.map((model) => [
        model.id,
        { tools: localToolsEnabled, vision: false, reasoning: false },
      ])
    );
  }

  const results = await Promise.all(
    chatModels.map(async (model) => {
      try {
        const res = await fetch(
          `https://ai-gateway.vercel.sh/v1/models/${model.id}/endpoints`,
          { next: { revalidate: 86_400 } }
        );
        if (!res.ok) {
          return [model.id, { tools: false, vision: false, reasoning: false }];
        }

        const json = await res.json();
        const endpoints = json.data?.endpoints ?? [];
        const params = new Set(
          endpoints.flatMap(
            (e: { supported_parameters?: string[] }) =>
              e.supported_parameters ?? []
          )
        );
        const inputModalities = new Set(
          json.data?.architecture?.input_modalities ?? []
        );

        return [
          model.id,
          {
            tools: params.has("tools"),
            vision: inputModalities.has("image"),
            reasoning: params.has("reasoning"),
          },
        ];
      } catch {
        return [model.id, { tools: false, vision: false, reasoning: false }];
      }
    })
  );

  return Object.fromEntries(results);
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
  if (isLocalProvider) {
    return [];
  }

  try {
    const res = await fetch("https://ai-gateway.vercel.sh/v1/models", {
      next: { revalidate: 86_400 },
    });
    if (!res.ok) {
      return [];
    }

    const json = await res.json();
    return (json.data ?? [])
      .filter((m: GatewayModel) => m.type === "language")
      .map((m: GatewayModel) => ({
        id: m.id,
        name: m.name,
        provider: m.id.split("/")[0],
        description: "",
        capabilities: {
          tools: m.tags?.includes("tool-use") ?? false,
          vision: m.tags?.includes("vision") ?? false,
          reasoning: m.tags?.includes("reasoning") ?? false,
        },
      }));
  } catch {
    return [];
  }
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
