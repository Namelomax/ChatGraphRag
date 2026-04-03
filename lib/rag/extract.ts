import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import * as XLSX from "xlsx";

function isLikelyTextContent(contentType: string, filename: string) {
  const lower = filename.toLowerCase();
  return (
    contentType.startsWith("text/") ||
    lower.endsWith(".txt") ||
    lower.endsWith(".md") ||
    lower.endsWith(".csv") ||
    lower.endsWith(".json") ||
    lower.endsWith(".xml")
  );
}

export async function extractDocumentText(file: File): Promise<string> {
  if (isLikelyTextContent(file.type, file.name)) {
    return file.text();
  }

  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (name.endsWith(".pdf")) {
    const parser = new PDFParse({ data: buffer });
    const parsed = await parser.getText();
    await parser.destroy();
    return parsed.text?.trim() ?? "";
  }

  if (name.endsWith(".docx")) {
    const parsed = await mammoth.extractRawText({ buffer });
    return parsed.value.trim();
  }

  if (name.endsWith(".doc")) {
    return new TextDecoder("utf-8").decode(buffer).replace(/\0/g, "").trim();
  }

  if (name.endsWith(".xls") || name.endsWith(".xlsx")) {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const lines: string[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
        header: 1,
        raw: false,
        blankrows: false,
      });
      const sheetContent = rows.map((row) => row.join(" | ")).join("\n").trim();
      if (sheetContent) {
        lines.push(`Sheet: ${sheetName}\n${sheetContent}`);
      }
    }
    return lines.join("\n\n").trim();
  }

  return "";
}
