/**
 * Файлы, для которых Next.js ждёт завершения индексации в rag-api перед ответом на POST /api/files/upload.
 * Должен совпадать с логикой маршрута загрузки.
 */
export const RAG_INDEXABLE_EXTENSIONS = new Set([
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".txt",
  ".md",
  ".pdf",
  ".rtf",
]);

export function fileRequiresRagIndexing(filename: string): boolean {
  const dot = filename.lastIndexOf(".");
  const ext = dot >= 0 ? filename.slice(dot).toLowerCase() : "";
  return RAG_INDEXABLE_EXTENSIONS.has(ext);
}
