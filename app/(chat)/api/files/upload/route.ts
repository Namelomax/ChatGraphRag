import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { extractDocumentText } from "@/lib/rag/extract";
import { saveLocalFile } from "@/lib/storage/local-files";

const FileSchema = z.object({
  file: z
    .instanceof(Blob)
    .refine((file) => file.size <= 50 * 1024 * 1024, {
      message: "File size should be less than 50MB",
    })
    .refine((file) => file.type.length > 0, {
      message: "File type should be provided",
    }),
});

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

    const validatedFile = FileSchema.safeParse({ file });

    if (!validatedFile.success) {
      const errorMessage = validatedFile.error.errors
        .map((error) => error.message)
        .join(", ");

      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    try {
      const data = await saveLocalFile(file);
      const extractedText = await extractDocumentText(file);

      console.log(`[File Upload] name=${file.name}, size=${file.size}, textLength=${extractedText?.length ?? 0}`);

      // Return text for systemPrompt, do NOT index to RAG here
      return NextResponse.json({
        url: data.url,
        pathname: data.pathname,
        name: data.originalName,
        contentType: data.contentType || "application/octet-stream",
        text: extractedText,
      });
    } catch (_error) {
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
  } catch (_error) {
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
