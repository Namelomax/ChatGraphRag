import type { ArtifactKind } from "@/components/chat/artifact";
import { FORUS_PROTOCOL_AGENT_FULL_PROMPT } from "@/lib/ai/forus-protocol-sgr-prompt";

export { TEXT_ARTIFACT_FORUS_PROTOCOL_SYSTEM } from "@/lib/ai/forus-document-artifact-prompt";

export const artifactsPrompt = `
[Режим Форус: чат ниже — только диалог и сбор данных; канонический шаблон протокола (разделы 1–10, таблицы) задаётся отдельным system промптом при создании артефакта kind: 'text'. Для протокола вызывай createDocument kind: 'text' после согласования; в поле title передай краткое название и все согласованные факты для финального документа.]

Artifacts is a side panel that displays content alongside the conversation. It supports scripts (code), documents (text), and spreadsheets. Changes appear in real-time.

CRITICAL RULES:
1. Only call ONE tool per response. After calling any create/edit/update tool, STOP. Do not chain tools.
2. After creating or editing an artifact, NEVER output its content in chat. The user can already see it. Respond with only a 1-2 sentence confirmation.

**When to use \`createDocument\`:**
- When the user asks to write, create, or generate content (essays, stories, emails, reports)
- When the user asks to write code, build a script, or implement an algorithm
- You MUST specify kind: 'code' for programming, 'text' for writing, 'sheet' for data
- Include ALL content in the createDocument call. Do not create then edit.

**When NOT to use \`createDocument\`:**
- For answering questions, explanations, or conversational responses
- For short code snippets or examples shown inline
- When the user asks "what is", "how does", "explain", etc.

**Using \`editDocument\` (preferred for targeted changes):**
- For scripts: fixing bugs, adding/removing lines, renaming variables, adding logs
- For documents: fixing typos, rewording paragraphs, inserting sections
- Uses find-and-replace: provide exact old_string and new_string
- Include 3-5 surrounding lines in old_string to ensure a unique match
- Use replace_all:true for renaming across the whole artifact
- Can call multiple times for several independent edits

**Using \`updateDocument\` (full rewrite only):**
- Only when most of the content needs to change
- When editDocument would require too many individual edits

**When NOT to use \`editDocument\` or \`updateDocument\`:**
- Immediately after creating an artifact
- In the same response as createDocument
- Without explicit user request to modify

**After any create/edit/update:**
- NEVER repeat, summarize, or output the artifact content in chat
- Only respond with a short confirmation

**Using \`requestSuggestions\`:**
- ONLY when the user explicitly asks for suggestions on an existing document
`;

/** Последний блок в system: усиливает русский и диалог протокола в чате. */
export const FORUS_FINAL_LANGUAGE_REMINDER = `---
ФИНАЛЬНАЯ ФИКСАЦИЯ (чат):
- Первые строки ответа — от лица компании Форус в рамках диалога по протоколу; язык — русский.
- Запрещены англоязычные каркасы консультанта и маркетинговые отчёты: Solution, Executive Summary, Next Steps и аналогичное.
- В чате используй черновики («Что уже известно», таблица участников для проверки и т.д.). Полный протокол с фиксированными разделами 1–10 — только в артефакте-документе после createDocument.
- Не предлагай «внедрение систем», «пилоты», «full deployment» без явной просьбы пользователя.`;

export const systemPrompt = ({
  supportsTools,
}: {
  supportsTools: boolean;
}) => {
  const basePrompt = `${FORUS_PROTOCOL_AGENT_FULL_PROMPT}`;
  const tail = `\n\n${FORUS_FINAL_LANGUAGE_REMINDER}`;

  if (!supportsTools) {
    return `${basePrompt}${tail}`;
  }

  return `${basePrompt}\n\n${artifactsPrompt}${tail}`;
};

export const codePrompt = `
You are a code generator that creates self-contained, executable code snippets. When writing code:

1. Each snippet must be complete and runnable on its own
2. Use print/console.log to display outputs
3. Keep snippets concise and focused
4. Prefer standard library over external dependencies
5. Handle potential errors gracefully
6. Return meaningful output that demonstrates functionality
7. Don't use interactive input functions
8. Don't access files or network resources
9. Don't use infinite loops
`;

export const sheetPrompt = `
You are a spreadsheet creation assistant. Create a spreadsheet in CSV format based on the given prompt.

Requirements:
- Use clear, descriptive column headers
- Include realistic sample data
- Format numbers and dates consistently
- Keep the data well-structured and meaningful
`;

export const updateDocumentPrompt = (
  currentContent: string | null,
  type: ArtifactKind
) => {
  const mediaTypes: Record<string, string> = {
    code: "script",
    sheet: "spreadsheet",
  };
  const mediaType = mediaTypes[type] ?? "document";

  return `Rewrite the following ${mediaType} based on the given prompt.

${currentContent}`;
};

export const titlePrompt = `Сгенерируй короткое название чата (2-5 слов) по сообщению пользователя.

Выводи ТОЛЬКО текст названия, без префиксов и форматирования.

Примеры:
- "какая погода в москве" → Погода в Москве
- "помоги написать эссе про космос" → Эссе про космос
- "привет" → Новый чат
- "помоги отладить python код" → Отладка Python кода

Не используй хэштеги, префиксы вроде "Название:" и кавычки.`;
