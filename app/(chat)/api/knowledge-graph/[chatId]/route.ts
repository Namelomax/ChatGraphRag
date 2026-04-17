import { auth } from "@/app/(auth)/auth";
import { ChatbotError } from "@/lib/errors";
import {
  getKnowledgeGraphForChat,
  deleteKnowledgeGraphForChat,
  getTopEntities,
  getRelatedEntities,
} from "@/lib/rag/knowledge-graph";
import { NextRequest } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const { chatId } = await params;
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  // Получаем весь граф
  if (!action || action === "full") {
    const graph = await getKnowledgeGraphForChat(chatId);
    return Response.json(graph);
  }

  // Получаем топ сущностей по типу
  if (action === "top") {
    const entityType = searchParams.get("type") ?? "PERSON";
    const limit = parseInt(searchParams.get("limit") ?? "20", 10);
    const entities = await getTopEntities({ chatId, entityType, limit });
    return Response.json({ entityType, entities });
  }

  // Получаем связанные сущности
  if (action === "related") {
    const entityName = searchParams.get("entity");
    if (!entityName) {
      return Response.json({ error: "Missing 'entity' parameter" }, { status: 400 });
    }
    const related = await getRelatedEntities({ chatId, entityName });
    return Response.json({ entity: entityName, related });
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const { chatId } = await params;
  await deleteKnowledgeGraphForChat(chatId);
  return Response.json({ success: true });
}
