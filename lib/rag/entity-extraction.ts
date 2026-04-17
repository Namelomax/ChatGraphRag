import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

const lmStudio = createOpenAI({
  baseURL: process.env.LOCAL_LLM_BASE_URL ?? "http://127.0.0.1:1234/v1",
  apiKey: process.env.LOCAL_LLM_API_KEY ?? "lm-studio",
});

const entityModel = process.env.LOCAL_LLM_MODEL ?? "qwen/qwen3.5-35b-a3b";

// Схема сущности
const entitySchema = z.object({
  name: z.string().describe("Полное название сущности"),
  type: z.enum(["PERSON", "ORG", "DECISION", "TASK", "TOPIC", "PROJECT", "TECHNOLOGY", "METRIC", "DATE", "LOCATION"]).describe("Тип сущности"),
  mentions: z.number().describe("Количество упоминаний в тексте"),
  context: z.string().describe("Краткий контекст (1-2 предложения)"),
});

// Схема связи
const relationSchema = z.object({
  from: z.string().describe("Название исходной сущности"),
  to: z.string().describe("Название целевой сущности"),
  type: z.enum(["WORKS_IN", "OWNS", "DECIDED", "RELATED_TO", "PART_OF", "DEPENDS_ON", "CREATED", "MENTIONED_IN", "RESPONSIBLE_FOR"]).describe("Тип связи"),
  strength: z.number().min(0).max(1).describe("Сила связи (0-1)"),
});

// Схема результата извлечения
const extractionSchema = z.object({
  entities: z.array(entitySchema).describe("Извлечённые именованные сущности"),
  relations: z.array(relationSchema).describe("Связи между сущностями"),
});

/**
 * Извлекает именованные сущности и связи из текста
 */
export async function extractEntitiesAndRelations(text: string) {
  const maxLength = 4000;
  const truncatedText = text.length > maxLength ? text.slice(0, maxLength) + "..." : text;

  try {
    const { object } = await generateObject({
      model: lmStudio.chat(entityModel),
      schema: extractionSchema,
      maxOutputTokens: 2048,
      temperature: 0.1,
      system: `You are a Named Entity Recognition and Relation Extraction system.
Extract entities and relations from the text.

ENTITY TYPES:
- PERSON: People, participants, responsible persons
- ORG: Organizations, companies, teams, departments
- DECISION: Made decisions, agreements, conclusions
- TASK: Action items, tasks, responsibilities, deadlines
- TOPIC: Discussion topics, concepts, themes
- PROJECT: Project names, initiatives
- TECHNOLOGY: Tools, platforms, technologies mentioned
- METRIC: Numbers, KPIs, measurements
- DATE: Dates, deadlines, time periods
- LOCATION: Offices, locations, meeting places

RELATION TYPES:
- WORKS_IN: Person works in organization (e.g., "Иван → Форус")
- OWNS: Person owns/responsible for task or decision
- DECIDED: Decision made during meeting
- RELATED_TO: General semantic relationship
- PART_OF: Entity is part of another
- DEPENDS_ON: Task depends on another
- CREATED: Entity was created/mentioned in context
- MENTIONED_IN: Entity mentioned together
- RESPONSIBLE_FOR: Person responsible for decision/task

RULES:
1. Extract ALL persons, organizations, decisions, tasks
2. Use exact names from text (preserve case, full names)
3. Merge duplicate entities (same person with different mentions)
4. Set mentions count to number of times entity appears
5. Provide brief context for each entity
6. Create relations only when relationship is explicit
7. Set strength based on confidence (0.7+ for explicit, 0.4-0.6 for implicit)
8. Return valid JSON only`,
      prompt: `Extract entities and relations from this meeting text:

${truncatedText}

Return JSON with "entities" and "relations" arrays.`,
    });

    return object;
  } catch (error) {
    console.error("[Entity Extraction] Error:", error);
    return { entities: [], relations: [] };
  }
}

/**
 * Упрощённая функция для быстрого извлечения (только основные сущности)
 */
export async function extractEntitiesQuick(text: string) {
  const quickSchema = z.object({
    entities: z.array(z.object({
      name: z.string(),
      type: z.enum(["PERSON", "ORG", "DECISION", "TASK", "TOPIC"]),
    })),
  });

  const maxLength = 2000;
  const truncatedText = text.length > maxLength ? text.slice(0, maxLength) + "..." : text;

  try {
    const { object } = await generateObject({
      model: lmStudio.chat(entityModel),
      schema: quickSchema,
      maxOutputTokens: 1024,
      temperature: 0.1,
      system: "Extract only PERSON, ORG, DECISION, TASK, TOPIC entities. Return JSON with entities array.",
      prompt: `Extract entities from: ${truncatedText}`,
    });

    return object;
  } catch (error) {
    console.error("[Quick Entity Extraction] Error:", error);
    return { entities: [] };
  }
}

/**
 * Нормализует сущности: объединяет дубликаты, приводит к единому формату
 */
export function normalizeEntities(entities: Array<{ name: string; type: string; mentions?: number; context?: string }>) {
  const entityMap = new Map<string, { name: string; type: string; mentions: number; context: string }>();

  for (const entity of entities) {
    const key = `${entity.type}:${entity.name.toLowerCase().trim()}`;
    const existing = entityMap.get(key);

    if (existing) {
      existing.mentions += entity.mentions ?? 1;
      if (!existing.context && entity.context) {
        existing.context = entity.context;
      }
    } else {
      entityMap.set(key, {
        name: entity.name,
        type: entity.type,
        mentions: entity.mentions ?? 1,
        context: entity.context ?? "",
      });
    }
  }

  return Array.from(entityMap.values());
}

/**
 * Фильтрует сущности по типу
 */
export function filterEntitiesByType(
  entities: Array<{ type: string }>,
  types: string[]
) {
  return entities.filter((e) => types.includes(e.type));
}

/**
 * Строит adjacency list из отношений для быстрого поиска соседей
 */
export function buildAdjacencyList(
  relations: Array<{ from: string; to: string; type: string; strength: number }>,
  entities: Array<{ name: string }>
) {
  const entityNames = new Set(entities.map((e) => e.name));
  const adj: Record<string, Array<{ target: string; relationType: string; strength: number }>> = {};

  for (const rel of relations) {
    if (!entityNames.has(rel.from) || !entityNames.has(rel.to)) continue;

    if (!adj[rel.from]) adj[rel.from] = [];
    if (!adj[rel.to]) adj[rel.to] = [];

    adj[rel.from].push({
      target: rel.to,
      relationType: rel.type,
      strength: rel.strength,
    });

    adj[rel.to].push({
      target: rel.from,
      relationType: rel.type,
      strength: rel.strength,
    });
  }

  return adj;
}
