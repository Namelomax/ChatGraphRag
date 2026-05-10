import type { ChatMessage } from "@/lib/types";

function messageHasFilePart(message: ChatMessage): boolean {
  return message.parts.some((part) => part.type === "file");
}

export function hasAttachedFilesInHistory(messages: ChatMessage[]): boolean {
  return messages.some(
    (message) => message.role === "user" && messageHasFilePart(message)
  );
}

/**
 * Как в Hakaton `adaptSystemPrompt`: после появления расшифровки (файл) или второго сообщения в диалоге
 * — не показывать длинное приветствие, сразу переходить к поэтапному сбору протокола.
 */
export function buildTranscriptAdaptationPrefix(
  messages: ChatMessage[]
): string {
  const hasFiles = hasAttachedFilesInHistory(messages);
  const multiTurn = messages.length > 1;

  if (!hasFiles && !multiTurn) {
    return "";
  }

  return `АДАПТАЦИЯ: Расшифровка получена
════════════════════════════════════════════
⚡ ПРОПУСТИ ЭТАП 1 (приветствие «Привет! Я AI-агент…»)!
⚡ У тебя уже есть расшифровка встречи (файл и/или история диалога).
⚡ НЕМЕДЛЕННО ПЕРЕХОДИ К ЭТАПУ СБОРА ИНФОРМАЦИИ ПО РАЗДЕЛАМ ПРОТОКОЛА.
⚡ Начни с проверки понимания повестки / ключевых тем из расшифровки (коротко, на русском), затем последовательно закрывай разделы схемы.
⚡ Не проси пользователя «прислать расшифровку» или «отправьте текст», если уже есть вложение-файл в этом чате — файл уже загружен; при отсутствии текста в сообщении опирайся на RAG и имя файла, не требуй повторной загрузки.
════════════════════════════════════════════

`;
}
