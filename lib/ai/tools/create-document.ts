import { tool, type UIMessage, type UIMessageStreamWriter } from "ai";
import type { Session } from "next-auth";
import { z } from "zod";
import {
  artifactKinds,
  documentHandlersByArtifactKind,
} from "@/lib/artifacts/server";
import type { ChatMessage } from "@/lib/types";
import { generateUUID } from "@/lib/utils";

type CreateDocumentProps = {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
  modelId: string;
  /** Полный RAG-контекст (расшифровка встречи) */
  ragContext?: string;
  /** История сообщений чата для контекста документа */
  chatMessages?: UIMessage[];
};

export const createDocument = ({
  session,
  dataStream,
  modelId,
  ragContext,
  chatMessages,
}: CreateDocumentProps) =>
  tool({
    description:
      "Create an artifact. WARNING: ONLY call when user EXPLICITLY says 'создай документ', 'сформируй протокол', 'create the document', or 'generate the protocol'. NEVER call on 'давай начнем', 'начнем', 'давай', 'ок', 'верно' — these are NOT document creation commands. You MUST complete ALL 9 data collection steps through dialogue BEFORE calling this tool. Premature document creation is a critical error. Use kind: 'text' for essays/protocols, 'code' for scripts, 'sheet' for spreadsheets.",
    inputSchema: z.object({
      title: z.string().describe("The title of the artifact"),
      kind: z
        .enum(artifactKinds)
        .describe(
          "REQUIRED. 'code' for programming/algorithms, 'text' for essays/writing, 'sheet' for spreadsheets"
        ),
    }),
    execute: async ({ title, kind }) => {
      const id = generateUUID();

      dataStream.write({
        type: "data-kind",
        data: kind,
        transient: true,
      });

      dataStream.write({
        type: "data-id",
        data: id,
        transient: true,
      });

      dataStream.write({
        type: "data-title",
        data: title,
        transient: true,
      });

      dataStream.write({
        type: "data-clear",
        data: null,
        transient: true,
      });

      const documentHandler = documentHandlersByArtifactKind.find(
        (documentHandlerByArtifactKind) =>
          documentHandlerByArtifactKind.kind === kind
      );

      if (!documentHandler) {
        throw new Error(`No document handler found for kind: ${kind}`);
      }

      await documentHandler.onCreateDocument({
        id,
        title,
        dataStream,
        session,
        modelId,
        ragContext,
        chatMessages,
      });

      console.log(`[createDocument] Used model: ${modelId}`);

      dataStream.write({ type: "data-finish", data: null, transient: true });

      return {
        id,
        title,
        kind,
        content:
          kind === "code"
            ? "A script was created and is now visible to the user."
            : "A document was created and is now visible to the user.",
      };
    },
  });
