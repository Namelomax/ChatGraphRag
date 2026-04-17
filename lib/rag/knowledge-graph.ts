import { surrealQuery, surrealQuerySafe } from "./surreal";

/**
 * Создаёт схему для графа знаний в SurrealDB
 * Таблицы: knowledge_entity, knowledge_relation, и связи между ними
 */
export async function ensureKnowledgeGraphSchema() {
  const statements = [
    // Таблица сущностей
    `DEFINE TABLE knowledge_entity SCHEMALESS;`,
    `DEFINE INDEX entity_user_idx ON TABLE knowledge_entity COLUMNS userId;`,
    `DEFINE INDEX entity_chat_idx ON TABLE knowledge_entity COLUMNS chatId;`,
    `DEFINE INDEX entity_type_idx ON TABLE knowledge_entity COLUMNS entityType;`,
    `DEFINE INDEX entity_name_idx ON TABLE knowledge_entity COLUMNS name;`,

    // Таблица связей
    `DEFINE TABLE knowledge_relation SCHEMALESS;`,
    `DEFINE INDEX relation_user_idx ON TABLE knowledge_relation COLUMNS userId;`,
    `DEFINE INDEX relation_chat_idx ON TABLE knowledge_relation COLUMNS chatId;`,
    `DEFINE INDEX relation_from_idx ON TABLE knowledge_relation COLUMNS fromEntity;`,
    `DEFINE INDEX relation_to_idx ON TABLE knowledge_relation COLUMNS toEntity;`,
    `DEFINE INDEX relation_type_idx ON TABLE knowledge_relation COLUMNS relationType;`,

    // Связь сущность -> chunk (через RELATE)
    `DEFINE TABLE mentioned_in SCHEMALESS TYPE RELATION;`,
    `DEFINE INDEX mentioned_entity_idx ON TABLE mentioned_in COLUMNS IN;`,
    `DEFINE INDEX mentioned_chunk_idx ON TABLE mentioned_in COLUMNS OUT;`,

    // Связь документ -> сущность (через RELATE)
    `DEFINE TABLE contains_entity SCHEMALESS TYPE RELATION;`,
    `DEFINE INDEX contains_doc_idx ON TABLE contains_entity COLUMNS IN;`,
    `DEFINE INDEX contains_entity_idx ON TABLE contains_entity COLUMNS OUT;`,
  ];

  for (const stmt of statements) {
    try {
      await surrealQuerySafe(stmt, {});
    } catch (error) {
      // Игнорируем ошибки "already exists"
      const errStr = String(error);
      if (!errStr.includes("AlreadyExists") && !errStr.includes("already exists")) {
        console.warn("[Knowledge Graph Schema] Warning:", error);
      }
    }
  }
}

/**
 * Вставляет сущность в граф знаний
 */
export async function insertKnowledgeEntity(entity: {
  id?: string;
  chatId: string;
  userId: string;
  name: string;
  entityType: string;
  mentions: number;
  context: string;
  sourceChunks?: string[]; // IDs chunks, где сущность упоминается
}) {
  const entityId = entity.id || `knowledge_entity:${crypto.randomUUID()}`;
  const rawChatId = entity.chatId.startsWith("chat:") ? entity.chatId.slice(5) : entity.chatId;
  const rawUserId = entity.userId.startsWith("user:") ? entity.userId.slice(5) : entity.userId;

  await surrealQuery(
    `CREATE type::thing('knowledge_entity', $id) CONTENT {
      chatId: "chat:${rawChatId}",
      userId: "user:${rawUserId}",
      name: $name,
      entityType: $entityType,
      mentions: $mentions,
      context: $context,
      createdAt: time::now()
    };`,
    {
      id: entityId.split(":")[1],
      name: entity.name,
      entityType: entity.entityType,
      mentions: entity.mentions,
      context: entity.context,
    }
  );

  // Создаём связи с chunks если указаны
  if (entity.sourceChunks && entity.sourceChunks.length > 0) {
    for (const chunkId of entity.sourceChunks) {
      try {
        await surrealQuery(
          `RELATE type::thing('knowledge_entity', $entityId)->mentioned_in->type::thing('rag_chunk', $chunkId);`,
          {
            entityId: entityId.split(":")[1],
            chunkId: chunkId.split(":")[1] || chunkId,
          }
        );
      } catch (error) {
        console.warn("[Knowledge Graph] Failed to create mentioned_in relation:", error);
      }
    }
  }

  return entityId;
}

/**
 * Вставляет связь между сущностями
 */
export async function insertKnowledgeRelation(relation: {
  id?: string;
  chatId: string;
  userId: string;
  fromEntity: string;
  toEntity: string;
  relationType: string;
  strength: number;
}) {
  const relationId = relation.id || `knowledge_relation:${crypto.randomUUID()}`;
  const rawChatId = relation.chatId.startsWith("chat:") ? relation.chatId.slice(5) : relation.chatId;
  const rawUserId = relation.userId.startsWith("user:") ? relation.userId.slice(5) : relation.userId;

  await surrealQuery(
    `CREATE type::thing('knowledge_relation', $id) CONTENT {
      chatId: "chat:${rawChatId}",
      userId: "user:${rawUserId}",
      fromEntity: $fromEntity,
      toEntity: $toEntity,
      relationType: $relationType,
      strength: $strength,
      createdAt: time::now()
    };`,
    {
      id: relationId.split(":")[1],
      fromEntity: relation.fromEntity,
      toEntity: relation.toEntity,
      relationType: relation.relationType,
      strength: relation.strength,
    }
  );

  return relationId;
}

/**
 * Связывает документ с извлечёнными сущностями
 */
export async function linkDocumentToEntities(params: {
  documentId: string;
  entityIds: string[];
}) {
  const results = [];
  for (const entityId of params.entityIds) {
    try {
      await surrealQuery(
        `RELATE type::thing('rag_document', $docId)->contains_entity->type::thing('knowledge_entity', $entityId);`,
        {
          docId: params.documentId.split(":")[1] || params.documentId,
          entityId: entityId.split(":")[1] || entityId,
        }
      );
      results.push(entityId);
    } catch (error) {
      console.warn("[Knowledge Graph] Failed to link document to entity:", entityId, error);
    }
  }
  return results;
}

/**
 * Находит связанные сущности для данной сущности (1-hop neighborhood)
 */
export async function getRelatedEntities(params: {
  chatId: string;
  entityName: string;
  maxHops?: number;
}) {
  const rawChatId = params.chatId.startsWith("chat:") ? params.chatId.slice(5) : params.chatId;
  const hops = params.maxHops ?? 1;

  const result = await surrealQuery<
    Array<{ result?: Array<{
      id: string;
      name: string;
      entityType: string;
      relationType: string;
      strength: number;
    }> }>
  >(
    `SELECT
      fe.name,
      fe.entityType,
      fr.relationType,
      fr.strength
    FROM knowledge_relation fr
    JOIN knowledge_entity fe
    ON (fr.toEntity = fe.name OR fr.fromEntity = fe.name)
    WHERE fr.chatId = "chat:${rawChatId}"
    AND (fr.fromEntity = $entityName OR fr.toEntity = $entityName)
    AND fe.name != $entityName
    ORDER BY fr.strength DESC;`,
    { entityName: params.entityName }
  );

  return result.at(0)?.result ?? [];
}

/**
 * Получает топ сущностей по типу для чата
 */
export async function getTopEntities(params: {
  chatId: string;
  entityType: string;
  limit?: number;
}) {
  const rawChatId = params.chatId.startsWith("chat:") ? params.chatId.slice(5) : params.chatId;
  const limit = params.limit ?? 20;

  const result = await surrealQuery<
    Array<{ result?: Array<{
      id: string;
      name: string;
      mentions: number;
      context: string;
    }> }>
  >(
    `SELECT name, mentions, context
    FROM knowledge_entity
    WHERE chatId = "chat:${rawChatId}"
    AND entityType = $entityType
    ORDER BY mentions DESC
    LIMIT ${limit};`,
    { entityType: params.entityType }
  );

  return result.at(0)?.result ?? [];
}

/**
 * Получает весь граф для чата (для визуализации или анализа)
 */
export async function getKnowledgeGraphForChat(chatId: string) {
  const rawChatId = chatId.startsWith("chat:") ? chatId.slice(5) : chatId;

  const [entities, relations] = await Promise.all([
    surrealQuery<
      Array<{ result?: Array<{ id: string; name: string; entityType: string; mentions: number; context: string }> }>
    >(
      `SELECT id, name, entityType, mentions, context
      FROM knowledge_entity
      WHERE chatId = "chat:${rawChatId}"
      ORDER BY mentions DESC;`,
      {}
    ),
    surrealQuery<
      Array<{ result?: Array<{ id: string; fromEntity: string; toEntity: string; relationType: string; strength: number }> }>
    >(
      `SELECT id, fromEntity, toEntity, relationType, strength
      FROM knowledge_relation
      WHERE chatId = "chat:${rawChatId}"
      ORDER BY strength DESC;`,
      {}
    ),
  ]);

  return {
    entities: entities.at(0)?.result ?? [],
    relations: relations.at(0)?.result ?? [],
  };
}

/**
 * Удаляет граф знаний для чата
 */
export async function deleteKnowledgeGraphForChat(chatId: string) {
  const rawChatId = chatId.startsWith("chat:") ? chatId.slice(5) : chatId;

  await Promise.all([
    surrealQuery(`DELETE FROM knowledge_entity WHERE chatId = "chat:${rawChatId}";`, {}),
    surrealQuery(`DELETE FROM knowledge_relation WHERE chatId = "chat:${rawChatId}";`, {}),
  ]);
}

/**
 * Графовый поиск: находит сущности и связанные с ними chunk'и
 */
export async function graphBasedSearch(params: {
  chatId: string;
  userId: string;
  query: string;
  topEntities?: number;
}) {
  const rawChatId = params.chatId.startsWith("chat:") ? params.chatId.slice(5) : params.chatId;
  const topN = params.topEntities ?? 5;

  // Сначала ищем сущности через vector similarity (упрощённо - по имени)
  const result = await surrealQuery<
    Array<{ result?: Array<{
      entityId: string;
      entityName: string;
      entityType: string;
      mentions: number;
      relatedChunkIds: string[];
    }> }>
  >(
    `SELECT
      ke.id as entityId,
      ke.name as entityName,
      ke.entityType,
      ke.mentions,
      array::group(id::text(mc.out)) as relatedChunkIds
    FROM knowledge_entity ke
    LEFT JOIN mentioned_in mc ON ke.id = mc.in
    WHERE ke.chatId = "chat:${rawChatId}"
    AND string::contains(string::lowercase(ke.name), string::lowercase($query))
    GROUP BY ke.id, ke.name, ke.entityType, ke.mentions
    ORDER BY ke.mentions DESC
    LIMIT ${topN};`,
    { query: params.query }
  );

  return result.at(0)?.result ?? [];
}
