import { smoothStream, streamText } from "ai";
import { updateDocumentPrompt } from "@/lib/ai/prompts";
import { getLanguageModel } from "@/lib/ai/providers";
import { createDocumentHandler } from "@/lib/artifacts/server";

/**
 * Формирует контекст для генерации документа из RAG данных и истории чата
 */
function buildDocumentContext(params: {
  ragContext?: string;
  chatMessages?: Array<{ role: string; parts?: Array<{ type: string; text?: string }> }>;
}): string {
  const parts: string[] = [];

  // 1. RAG-контекст (расшифровка встречи)
  if (params.ragContext) {
    parts.push(`## РАСШИФРОВКА ВСТРЕЧИ (ОСНОВНОЙ ИСТОЧНИК ФАКТОВ)
Используй ТОЛЬКО факты из этой расшифровки. НЕ придумывай участников, решения или даты.

${params.ragContext}`);
  }

  // 2. История чата — особенно последний ассистент-сообщение с извлечёнными данными
  if (params.chatMessages && params.chatMessages.length > 0) {
    // Берём последние 10 сообщений для контекста
    const recentMessages = params.chatMessages.slice(-10);
    
    const chatContext = recentMessages
      .map((msg) => {
        const role = msg.role === "user" ? "Пользователь" : "Ассистент";
        const textParts = msg.parts
          ?.filter((p) => p.type === "text" && p.text)
          .map((p) => p.text)
          .join("\n")
          .trim();
        
        return textParts ? `${role}: ${textParts}` : null;
      })
      .filter(Boolean)
      .join("\n\n");

    if (chatContext) {
      parts.push(`## ИСТОРИЯ ДИАЛОГА (извлечённые данные)
Ниже — данные, которые ассистент уже извлёк из расшифровки и согласовал с пользователем:

${chatContext}`);
    }
  }

  return parts.join("\n\n---\n\n");
}

export const textDocumentHandler = createDocumentHandler<"text">({
  kind: "text",
  onCreateDocument: async ({ title, dataStream, modelId, ragContext, chatMessages }) => {
    let draftContent = "";

    // Строим контекст из RAG + истории чата
    const context = buildDocumentContext({ ragContext, chatMessages });

    const { fullStream } = streamText({
      model: getLanguageModel(modelId),
      system: context
        ? `## РОЛЬ
Ты — AI-агент компании «Форус» для подготовки протоколов обследования.

## КРИТИЧЕСКИ ВАЖНО
- Используй ТОЛЬКО факты из предоставленного контекста ниже
- НЕ придумывай участников, должности, даты, решения
- Если данных нет — пиши "Информация не предоставлена"
- Все ФИО, должности, организации бери СТРОГО из контекста
- Даты в формате ДД.ММ.ГГГГ

## СТРУКТУРА ДОКУМЕНТА (10 ОБЯЗАТЕЛЬНЫХ РАЗДЕЛОВ)

ДОКУМЕНТ ДОЛЖЕН СОДЕРЖАТЬ ВСЕ 10 РАЗДЕЛОВ В УКАЗАННОМ ПОРЯДКЕ:

### 1. Номер и дата протокола
- Номер: №[номер]
- Дата: ДД.ММ.ГГГГ

### 2. Повестка
- Основная тема встречи
- Пункты повестки (маркированный список)

### 3. Участники
Две таблицы:

**Заказчик: [Название организации]**

| ФИО | Должность |
| --- | --------- |
| [ФИО] | [Должность] |

**Исполнитель: [Название организации]**

| ФИО | Должность |
| --- | --------- |
| [ФИО] | [Должность] |

### 4. Термины и определения
Список: "Термин — Определение"

### 5. Сокращения и обозначения
Список: "Аббревиатура — Полная форма"

### 6. Содержание встречи
- Вводная часть
- Темы обсуждения (каждая с подзаголовком)
- Особенности миграции (если применимо)

### 7. Вопросы и ответы
Таблица:

| № | Вопрос | Ответ |
| --- | --- | --- |
| 1 | [вопрос] | [ответ] |

### 8. Решения с ответственными
Таблица:

| № | Решение | Ответственный |
| --- | --- | --- |
| 1 | [решение] | [ФИО] |

### 9. Открытые вопросы
Маркированный список нерешённых вопросов

### 10. Согласовано
Таблица:

| Сторона | ФИО | Подпись | Дата |
| --- | --- | --- | --- |
| Форус | [ФИО] | _______________ | ..2024 |
| [Заказчик] | [ФИО] | _______________ | ..2024 |

## ПРАВИЛА ФОРМАТИРОВАНИЯ
- Markdown для всех заголовков (# ## ###)
- Markdown таблицы ОБЯЗАТЕЛЬНЫ для участников, решений, вопросов, подписей
- НЕ используй HTML-теги
- НЕ используй <table> — только markdown |col|col|
- Пустые разделы: "Информация не предоставлена"

${context}`
        : "Write about the given topic. Markdown is supported. Use headings wherever appropriate.",
      experimental_transform: smoothStream({ chunking: "word" }),
      prompt: context
        ? `Создай документ: ${title}

СТРОГО следуй структуре из 10 разделов, описанной в системном промпте.
Все таблицы оформляй в Markdown формате: |col1|col2|
Используй ТОЛЬКО данные из контекста выше.`
        : title,
    });

    for await (const delta of fullStream) {
      if (delta.type === "text-delta") {
        draftContent += delta.text;
        dataStream.write({
          type: "data-textDelta",
          data: delta.text,
          transient: true,
        });
      }
    }

    return draftContent;
  },
  onUpdateDocument: async ({ document, description, dataStream, modelId }) => {
    let draftContent = "";

    const { fullStream } = streamText({
      model: getLanguageModel(modelId),
      system: updateDocumentPrompt(document.content, "text"),
      experimental_transform: smoothStream({ chunking: "word" }),
      prompt: description,
    });

    for await (const delta of fullStream) {
      if (delta.type === "text-delta") {
        draftContent += delta.text;
        dataStream.write({
          type: "data-textDelta",
          data: delta.text,
          transient: true,
        });
      }
    }

    return draftContent;
  },
});
