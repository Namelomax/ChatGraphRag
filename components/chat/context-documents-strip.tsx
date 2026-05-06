"use client";

import { FileTextIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Attachment, ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

type ContextDocument = {
  url: string;
  name: string;
  pending: boolean;
};

function getFormatLabel(filename: string) {
  const extension = filename.split(".").pop()?.trim().toUpperCase();
  if (!extension || extension === filename.toUpperCase()) {
    return "FILE";
  }
  return extension.slice(0, 6);
}

function collectContextDocuments(
  messages: ChatMessage[],
  attachments: Attachment[]
): ContextDocument[] {
  const docsByUrl = new Map<string, ContextDocument>();

  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type !== "file") {
        continue;
      }
      const url = part.url;
      if (!url || docsByUrl.has(url)) {
        continue;
      }
      docsByUrl.set(url, {
        url,
        name: part.filename ?? ("name" in part ? String(part.name ?? "file") : "file"),
        pending: false,
      });
    }
  }

  for (const attachment of attachments) {
    if (docsByUrl.has(attachment.url)) {
      continue;
    }
    docsByUrl.set(attachment.url, {
      url: attachment.url,
      name: attachment.name,
      pending: true,
    });
  }

  return Array.from(docsByUrl.values());
}

export function ContextDocumentsStrip({
  messages,
  attachments,
  excludedAttachmentUrls,
  onExcludeDocument,
  onRestoreDocument,
  onRemovePendingAttachment,
}: {
  messages: ChatMessage[];
  attachments: Attachment[];
  excludedAttachmentUrls: string[];
  onExcludeDocument: (url: string) => void;
  onRestoreDocument: (url: string) => void;
  onRemovePendingAttachment: (url: string) => void;
}) {
  const docs = collectContextDocuments(messages, attachments);

  if (docs.length === 0) {
    return null;
  }

  return (
    <div className="mx-auto mt-2 flex w-full max-w-4xl items-center gap-2 overflow-x-auto px-2 pb-1 md:px-4">
      {docs.map((doc) => {
        const isExcluded = excludedAttachmentUrls.includes(doc.url);
        const formatLabel = getFormatLabel(doc.name);

        return (
          <div
            className={cn(
              "group flex h-8 shrink-0 items-center gap-2 rounded-full border px-2.5",
              isExcluded
                ? "border-border/30 bg-muted/30 text-muted-foreground"
                : "border-border/50 bg-card text-foreground"
            )}
            key={doc.url}
            title={doc.name}
          >
            <FileTextIcon className="size-4.5" />
            <span
              className={cn(
                "rounded-full border px-1.0 py-0.5 font-medium text-[10px] leading-none tracking-wide",
                isExcluded
                  ? "border-border/30 bg-muted/40 line-through"
                  : "border-border/60 bg-background/70"
              )}
            >
              {formatLabel}
            </span>
            <Button
              className="h-5 w-3 rounded-full p-0 text-muted-foreground hover:text-foreground"
              onClick={() => {
                if (doc.pending) {
                  onRemovePendingAttachment(doc.url);
                  return;
                }
                if (isExcluded) {
                  onRestoreDocument(doc.url);
                } else {
                  onExcludeDocument(doc.url);
                }
              }}
              size="icon"
              type="button"
              variant="ghost"
            >
              <XIcon className="size-3.5" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
