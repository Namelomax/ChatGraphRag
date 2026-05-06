import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import mammoth from "mammoth";
import { NextResponse } from "next/server";

import { auth } from "@/app/(auth)/auth";
import { uploadDocumentToRAG } from "@/lib/ai/rag-service";

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const allowedMimeTypes = new Set([
  // Images
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/json",
  "application/rtf",
  "application/zip",
  "application/x-zip-compressed",
]);

const allowedExtensions = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".txt",
  ".csv",
  ".md",
  ".json",
  ".rtf",
  ".zip",
]);

const officeExtensionsToConvert = new Set([
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".rtf",
  ".odt",
  ".ods",
  ".odp",
]);

const ragSupportedExtensions = new Set([
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

const execFileAsync = promisify(execFile);
const MAX_EXTRACTED_TEXT_CHARS = 12000;

function validateFile(file: File) {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return "File size should be less than 25MB";
  }

  const extension = path.extname(file.name).toLowerCase();
  const hasAllowedMime = allowedMimeTypes.has(file.type);
  const hasAllowedExtension = allowedExtensions.has(extension);

  if (!hasAllowedMime && !hasAllowedExtension) {
    return "Unsupported file type. Allowed: images, PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, TXT, CSV, MD, JSON, RTF, ZIP";
  }

  return null;
}

async function convertOfficeToPdf({
  uploadsDir,
  uniquePrefix,
  safeName,
  fileBuffer,
}: {
  uploadsDir: string;
  uniquePrefix: string;
  safeName: string;
  fileBuffer: ArrayBuffer;
}) {
  const sourcePath = path.join(uploadsDir, `${uniquePrefix}-${safeName}`);
  const sourceBaseName = path.parse(sourcePath).name;
  const expectedPdfName = `${sourceBaseName}.pdf`;
  const expectedPdfPath = path.join(uploadsDir, expectedPdfName);

  await writeFile(sourcePath, Buffer.from(fileBuffer));

  try {
    await execFileAsync("soffice", [
      "--headless",
      "--convert-to",
      "pdf",
      "--outdir",
      uploadsDir,
      sourcePath,
    ]);
  } catch (_error) {
    throw new Error(
      "LibreOffice conversion failed. Install LibreOffice and ensure `soffice` is available in PATH."
    );
  } finally {
    await rm(sourcePath, { force: true });
  }

  return {
    pathname: `/uploads/${expectedPdfName}`,
    url: `/uploads/${expectedPdfName}`,
    contentType: "application/pdf",
  };
}

function truncateExtractedText(text: string) {
  if (text.length <= MAX_EXTRACTED_TEXT_CHARS) {
    return text;
  }

  return `${text.slice(0, MAX_EXTRACTED_TEXT_CHARS)}\n\n[...truncated...]`;
}

async function extractTextWithLibreOffice({
  uploadsDir,
  sourcePath,
}: {
  uploadsDir: string;
  sourcePath: string;
}) {
  await execFileAsync("soffice", [
    "--headless",
    "--convert-to",
    "txt:Text",
    "--outdir",
    uploadsDir,
    sourcePath,
  ]);

  const textPath = `${path.join(uploadsDir, path.parse(sourcePath).name)}.txt`;
  const content = await readFile(textPath, "utf8");
  await rm(textPath, { force: true });
  return truncateExtractedText(content);
}

async function extractDocxText(fileBuffer: ArrayBuffer) {
  const result = await mammoth.extractRawText({
    buffer: Buffer.from(fileBuffer),
  });

  const text = result.value.trim();
  if (!text) {
    return undefined;
  }

  return truncateExtractedText(text);
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (request.body === null) {
    return new Response("Request body is empty", { status: 400 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const validationError = validateFile(file);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const filename = file.name;
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const extension = path.extname(filename).toLowerCase();
    const fileBuffer = await file.arrayBuffer();
    const shouldIndexInRag = ragSupportedExtensions.has(extension);

    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    const uniquePrefix = randomUUID();
    const uniqueFilename = `${uniquePrefix}-${safeName}`;
    const outputPath = path.join(uploadsDir, uniqueFilename);

    try {
      await mkdir(uploadsDir, { recursive: true });

      if (officeExtensionsToConvert.has(extension)) {
        const sourcePath = path.join(uploadsDir, `${uniquePrefix}-${safeName}`);
        await writeFile(sourcePath, Buffer.from(fileBuffer));

        let extractedText: string | undefined;
        try {
          extractedText =
            extension === ".docx"
              ? await extractDocxText(fileBuffer)
              : await extractTextWithLibreOffice({ uploadsDir, sourcePath });
        } catch {
          extractedText = undefined;
        }

        const converted = await convertOfficeToPdf({
          uploadsDir,
          uniquePrefix,
          safeName,
          fileBuffer,
        });

        if (shouldIndexInRag) {
          await uploadDocumentToRAG(
            new File([fileBuffer], filename, {
              type: file.type || "application/octet-stream",
            })
          );
        }

        return NextResponse.json({
          ...converted,
          displayName: filename,
          extractedText,
          ragIndexed: shouldIndexInRag,
        });
      }

      await writeFile(outputPath, Buffer.from(fileBuffer));

      let extractedText: string | undefined;
      if (file.type.startsWith("text/") || extension === ".json" || extension === ".md") {
        extractedText = truncateExtractedText(Buffer.from(fileBuffer).toString("utf8"));
      }

      if (shouldIndexInRag) {
        await uploadDocumentToRAG(
          new File([fileBuffer], filename, {
            type: file.type || "application/octet-stream",
          })
        );
      }

      return NextResponse.json({
        pathname: `/uploads/${uniqueFilename}`,
        url: `/uploads/${uniqueFilename}`,
        contentType: file.type || "application/octet-stream",
        displayName: filename,
        extractedText,
        ragIndexed: shouldIndexInRag,
      });
    } catch (_error) {
      return NextResponse.json(
        { error: "Upload failed or RAG indexing failed" },
        { status: 500 }
      );
    }
  } catch (_error) {
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
