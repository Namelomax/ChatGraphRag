import { auth } from "@/app/(auth)/auth";
import { NextResponse } from "next/server";
import { getDocumentsByChat, deleteDocumentFromRag } from "@/lib/rag/surreal";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get("chatId");

  if (!chatId) {
    return NextResponse.json({ error: "chatId is required" }, { status: 400 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const documents = await getDocumentsByChat(chatId);
    return NextResponse.json({ documents });
  } catch (error) {
    console.error("Failed to get RAG documents:", error);
    return NextResponse.json(
      { error: "Failed to get documents" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get("chatId");
  const fileName = searchParams.get("fileName");

  if (!chatId || !fileName) {
    return NextResponse.json(
      { error: "chatId and fileName are required" },
      { status: 400 }
    );
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await deleteDocumentFromRag({ chatId, fileName });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete RAG document:", error);
    return NextResponse.json(
      { error: "Failed to delete document" },
      { status: 500 }
    );
  }
}
