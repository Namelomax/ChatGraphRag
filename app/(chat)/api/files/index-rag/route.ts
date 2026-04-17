import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { extractDocumentText } from "@/lib/rag/extract";
import { indexDocumentToGraphRag } from "@/lib/rag/service";

export async function POST(request: Request) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { chatId, fileName, text } = await request.json();

    if (!chatId || !fileName || !text) {
      return NextResponse.json(
        { error: "chatId, fileName, and text are required" },
        { status: 400 }
      );
    }

    await indexDocumentToGraphRag({
      chatId,
      userId: session.user.id,
      fileName,
      text,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to index document in RAG:", error);
    return NextResponse.json(
      { error: "Failed to index document" },
      { status: 500 }
    );
  }
}
