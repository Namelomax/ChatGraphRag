import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

const lmStudio = createOpenAI({
  baseURL: process.env.LOCAL_LLM_BASE_URL ?? "http://127.0.0.1:1234/v1",
  apiKey: process.env.LOCAL_LLM_API_KEY ?? "lm-studio",
});

export async function generateRagQuery(context: {
  userMessage: string;
  chatHistory: string;
}): Promise<string> {
  const { text } = await generateText({
    model: lmStudio.chat(process.env.LOCAL_LLM_MODEL ?? "qwen/qwen3.5-35b-a3b"),
    maxOutputTokens: 64,
    temperature: 0.3,
    prompt: `You are a RAG query generator. Based on the user's message and chat history, generate a short search query (3-5 words) to retrieve relevant context from the document database.

Rules:
- Output ONLY the query text, nothing else
- Use keywords that will match document content
- Focus on: participants, agenda, decisions, questions, meeting content

User message: "${context.userMessage.substring(0, 200)}"
Chat history: "${context.chatHistory.substring(0, 500)}"

Query:`,
  });

  return text.trim() || "участники повестка встреча";
}
