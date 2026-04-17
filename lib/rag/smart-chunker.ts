/**
 * Semantic-aware chunking с учётом структуры документа
 */

// Разделители по приоритету (от высшего к низшему)
const SEMANTIC_SEPARATORS = [
  "\n\n\n",    // Triple newline (paragraph breaks)
  "\n\n",     // Double newline (section breaks)
  "\n",       // Single newline (line breaks)
  ". ",       // Sentence boundary
  "! ",       // Exclamation
  "? ",       // Question
  ";",        // Semicolon
  ",",        // Comma
  " ",        // Space (last resort)
];

/**
 * Умный chunker, который пытается разбивать по семантическим границам
 */
export function semanticChunk(
  text: string,
  targetSize: number = 1200,
  overlap: number = 120
): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  let position = 0;

  while (position < normalized.length) {
    const endPosition = Math.min(position + targetSize, normalized.length);
    
    // Если это последний chunk, берём всё
    if (endPosition >= normalized.length) {
      const chunk = normalized.slice(position).trim();
      if (chunk) chunks.push(chunk);
      break;
    }

    // Ищем лучшую границу для разделения
    let splitPoint = endPosition;
    let bestSeparatorIndex = SEMANTIC_SEPARATORS.length;

    for (let i = 0; i < SEMANTIC_SEPARATORS.length; i++) {
      const separator = SEMANTIC_SEPARATORS[i];
      const lastSeparatorPos = normalized.lastIndexOf(separator, endPosition);
      
      if (lastSeparatorPos > position && lastSeparatorPos > position + targetSize * 0.5) {
        splitPoint = lastSeparatorPos + separator.length;
        bestSeparatorIndex = i;
        break; // Нашли лучшую границу
      }
    }

    // Если не нашли хорошую границу, используем endPosition
    if (bestSeparatorIndex === SEMANTIC_SEPARATORS.length) {
      splitPoint = endPosition;
    }

    const chunk = normalized.slice(position, splitPoint).trim();
    if (chunk) {
      chunks.push(chunk);
    }

    // Следующий chunk начинаем с overlap
    position = Math.max(splitPoint - overlap, position + 1);
  }

  return chunks;
}

/**
 * Chunker с поддержкой заголовков и секций
 * Сохраняет заголовки в метаданных
 */
export function chunkWithSections(text: string, targetSize: number = 1200): Array<{
  content: string;
  section: string;
  level: number;
}> {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  // Парсим заголовки (Markdown-style: #, ##, ###)
  const lines = normalized.split("\n");
  const sections: Array<{ start: number; end: number; title: string; level: number }> = [];
  let currentSection: { start: number; end: number; title: string; level: number } | null = null;
  let charIndex = 0;

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    
    if (headingMatch) {
      // Закрываем предыдущую секцию
      if (currentSection) {
        currentSection.end = charIndex;
        sections.push(currentSection);
      }
      
      currentSection = {
        start: charIndex,
        title: headingMatch[2],
        level: headingMatch[1].length,
        end: -1, // Will be set later
      };
    }
    
    charIndex += line.length + 1; // +1 for newline
  }

  // Закрываем последнюю секцию
  if (currentSection) {
    currentSection.end = normalized.length;
    sections.push(currentSection);
  } else {
    // Если заголовков нет, считаем весь текст одной секцией
    sections.push({
      start: 0,
      end: normalized.length,
      title: "Без заголовка",
      level: 0,
    });
  }

  // Разбиваем секции на chunks
  const result: Array<{ content: string; section: string; level: number }> = [];

  for (const section of sections) {
    const sectionText = normalized.slice(section.start, section.end).trim();
    
    if (sectionText.length <= targetSize) {
      result.push({
        content: sectionText,
        section: section.title,
        level: section.level,
      });
    } else {
      // Большая секция - разбиваем
      const subChunks = semanticChunk(sectionText, targetSize, 120);
      for (const chunk of subChunks) {
        result.push({
          content: chunk,
          section: section.title,
          level: section.level,
        });
      }
    }
  }

  return result;
}

/**
 * Определяет оптимальный размер chunk на основе статистики текста
 */
export function calculateOptimalChunkSize(text: string): number {
  const avgSentenceLength = estimateAvgSentenceLength(text);
  
  // Цель: 3-5 предложений на chunk
  const targetSentences = 4;
  const optimalSize = avgSentenceLength * targetSentences;
  
  // Ограничиваем разумными пределами
  return Math.max(500, Math.min(2000, Math.round(optimalSize)));
}

/**
 * Оценивает среднюю длину предложения в тексте
 */
function estimateAvgSentenceLength(text: string): number {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  if (sentences.length === 0) return 150; // Default
  
  const totalLength = sentences.reduce((sum, s) => sum + s.length, 0);
  return Math.round(totalLength / sentences.length);
}

// Экспортируем старые функции для обратной совместимости
export { chunkText, splitText } from "./chunker";
