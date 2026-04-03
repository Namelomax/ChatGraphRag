import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import * as XLSX from "xlsx";

const textDecoder = new TextDecoder("utf-8");

function getExtension(filename: string) {
  const parts = filename.toLowerCase().split(".");
  return parts.at(-1) ?? "";
}

function parseSpreadsheet(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sections: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      raw: false,
      blankrows: false,
    });
    const content = rows.map((row) => row.join(" | ")).join("\n").trim();
    if (content) {
      sections.push(`Sheet: ${sheetName}\n${content}`);
    }
  }

  return sections.join("\n\n");
}

export async function extractTextFromFile(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const extension = getExtension(file.name);
  const mime = file.type.toLowerCase();

  if (extension === "pdf" || mime === "application/pdf") {
    const parsed = await pdfParse(buffer);
    return parsed.text?.trim() ?? "";
  }

  if (
    extension === "docx" ||
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const parsed = await mammoth.extractRawText({ buffer });
    return parsed.value.trim();
  }

  if (extension === "doc" || mime === "application/msword") {
    // Best-effort fallback for legacy .doc files.
    return textDecoder.decode(buffer).replace(/\0/g, "").trim();
  }

  if (
    extension === "xlsx" ||
    extension === "xls" ||
    mime ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-excel"
  ) {
    return parseSpreadsheet(buffer);
  }

  if (mime.startsWith("text/") || ["txt", "md", "csv", "json"].includes(extension)) {
    return textDecoder.decode(buffer).trim();
  }

  return "";
}
