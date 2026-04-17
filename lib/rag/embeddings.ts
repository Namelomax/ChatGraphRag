const embeddingBase =
  process.env.LOCAL_LLM_BASE_URL ?? "http://127.0.0.1:1234/v1";
const embeddingModel =
  process.env.LOCAL_EMBEDDING_MODEL ?? "text-embedding-nomic-embed-text-v1.5";

type EmbeddingResponse = {
  data?: Array<{ embedding?: number[] }>;
};

export async function embedText(input: string): Promise<number[]> {
  const response = await fetch(`${embeddingBase}/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: embeddingModel,
      input,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Embedding request failed: ${response.status}`);
  }

  const json = (await response.json()) as EmbeddingResponse;
  const embedding = json.data?.at(0)?.embedding;
  if (!embedding) {
    throw new Error("Embedding vector is missing in response");
  }
  return embedding;
}

/**
 * Батчевая функция для эмбеддинга нескольких текстов за один вызов
 */
export async function embedTexts(inputs: string[]): Promise<number[][]> {
  if (inputs.length === 0) return [];

  const response = await fetch(`${embeddingBase}/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: embeddingModel,
      input: inputs,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Embedding request failed: ${response.status}`);
  }

  const json = (await response.json()) as EmbeddingResponse;
  const embeddings = json.data?.map((item) => item.embedding).filter((e): e is number[] => e !== undefined);

  if (!embeddings || embeddings.length !== inputs.length) {
    throw new Error(
      `Expected ${inputs.length} embeddings, got ${embeddings?.length ?? 0}`
    );
  }

  return embeddings;
}

export function cosineSimilarity(a: number[], b: number[]) {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
