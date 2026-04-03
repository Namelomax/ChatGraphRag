import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

function normalizeFilename(filename: string) {
  const name = filename.trim() || "file";
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function saveLocalFile(file: File) {
  await mkdir(UPLOAD_DIR, { recursive: true });

  const safeName = normalizeFilename(file.name);
  const uniqueName = `${Date.now()}-${safeName}`;
  const diskPath = path.join(UPLOAD_DIR, uniqueName);
  const buffer = Buffer.from(await file.arrayBuffer());

  await writeFile(diskPath, buffer);

  return {
    url: `/uploads/${uniqueName}`,
    pathname: uniqueName,
    originalName: file.name,
    contentType: file.type,
    diskPath,
  };
}
