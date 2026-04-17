export interface MockDocument {
  id: string;
  title: string;
  content: string;
  chunkId: string;
  chunkContent: string;
  embedding: number[];
  metadata: {
    source: string;
    page?: number;
    url?: string;
  };
}

export const mockDocuments: MockDocument[] = [
  {
    id: "doc-1",
    title: "Test Document 1",
    content:
      "This is a test document about artificial intelligence and machine learning.",
    chunkId: "chunk-1",
    chunkContent:
      "This is a test document about artificial intelligence and machine learning.",
    embedding: [0.1, 0.2, 0.3, 0.4, 0.5],
    metadata: { source: "test", page: 1 },
  },
  {
    id: "doc-2",
    title: "Test Document 2",
    content:
      "Machine learning is a subset of artificial intelligence that focuses on training algorithms.",
    chunkId: "chunk-2",
    chunkContent:
      "Machine learning is a subset of artificial intelligence that focuses on training algorithms.",
    embedding: [0.2, 0.3, 0.4, 0.5, 0.6],
    metadata: { source: "test", page: 2 },
  },
  {
    id: "doc-3",
    title: "Test Document 3",
    content:
      "Deep learning uses neural networks with multiple layers to learn complex patterns.",
    chunkId: "chunk-3",
    chunkContent:
      "Deep learning uses neural networks with multiple layers to learn complex patterns.",
    embedding: [0.3, 0.4, 0.5, 0.6, 0.7],
    metadata: { source: "test", page: 3 },
  },
];

export interface MockChat {
  id: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  context: string[];
}

export const mockChat: MockChat = {
  id: "chat-1",
  messages: [
    { role: "user", content: "Explain machine learning" },
    {
      role: "assistant",
      content: "Machine learning is a field of artificial intelligence...",
    },
  ],
  context: ["This is some context for the chat session"],
};

export interface MockLLMResponse {
  choices: Array<{
    message: {
      role: "assistant";
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export const mockLLMResponse: MockLLMResponse = {
  choices: [
    {
      message: {
        role: "assistant",
        content: "This is a mock response from the language model.",
      },
      finish_reason: "stop",
    },
  ],
  usage: {
    prompt_tokens: 50,
    completion_tokens: 30,
    total_tokens: 80,
  },
};

export const mockEmbeddings = [
  { documentId: "doc-1", embedding: [0.1, 0.2, 0.3, 0.4, 0.5] },
  { documentId: "doc-2", embedding: [0.2, 0.3, 0.4, 0.5, 0.6] },
  { documentId: "doc-3", embedding: [0.3, 0.4, 0.5, 0.6, 0.7] },
];
