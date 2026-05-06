import { z } from "zod";

const textPartSchema = z.object({
  type: z.enum(["text"]),
  text: z.string().min(1).max(20000),
});

const filePartSchema = z.object({
  type: z.enum(["file"]),
  mediaType: z.string().min(1).max(200),
  name: z.string().min(1).max(255).optional(),
  filename: z.string().min(1).max(255).optional(),
  extractedText: z.string().max(20000).optional(),
  url: z
    .string()
    .min(1)
    .refine((value) => value.startsWith("/") || /^https?:\/\//.test(value), {
      message: "File URL must be absolute or app-relative",
    }),
}).refine((value) => value.name || value.filename, {
  message: "File part must include name or filename",
});

const partSchema = z.union([textPartSchema, filePartSchema]);

const userMessageSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["user"]),
  parts: z.array(partSchema),
});

const toolApprovalMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  parts: z.array(z.record(z.unknown())),
});

export const postRequestBodySchema = z.object({
  id: z.string().uuid(),
  message: userMessageSchema.optional(),
  messages: z.array(toolApprovalMessageSchema).optional(),
  selectedChatModel: z.string(),
  selectedVisibilityType: z.enum(["public", "private"]),
  excludedAttachmentUrls: z.array(z.string().min(1)).optional(),
});

export type PostRequestBody = z.infer<typeof postRequestBodySchema>;
