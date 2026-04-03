export function chunkText(text: string, chunkSize: number, overlap: number) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const chunks: string[] = [];
  let index = 0;

  while (index < normalized.length) {
    const end = Math.min(index + chunkSize, normalized.length);
    const chunk = normalized.slice(index, end).trim();
    if (chunk) {
      chunks.push(chunk);
    }
    if (end === normalized.length) {
      break;
    }
    index = Math.max(0, end - overlap);
  }

  return chunks;
}
export function splitText(
  text: string,
  chunkSize = 800,
  overlap = 120
): string[] {
  const cleaned = text.replace(/\r\n/g, "\n").trim();
  if (!cleaned) {
    return [];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < cleaned.length) {
    const end = Math.min(start + chunkSize, cleaned.length);
    chunks.push(cleaned.slice(start, end));
    if (end === cleaned.length) {
      break;
    }
    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}
