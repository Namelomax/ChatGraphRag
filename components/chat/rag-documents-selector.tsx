"use client";

import { FileTextIcon, TrashIcon, DatabaseIcon, UploadIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";

interface RagDocument {
  fileName: string;
  chunkCount: number;
  createdAt: string;
}

export function RagDocumentsSelector({ chatId }: { chatId: string }) {
  const [open, setOpen] = useState(false);
  const [documents, setDocuments] = useState<RagDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState<string | null>(null);
  const ragFileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocuments = useCallback(async () => {
    if (!chatId) return;

    setIsLoading(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/rag-documents?chatId=${chatId}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch documents");
      }

      const data = await response.json();
      setDocuments(data.documents ?? []);
    } catch (error) {
      console.error("Failed to fetch RAG documents:", error);
    } finally {
      setIsLoading(false);
    }
  }, [chatId]);

  useEffect(() => {
    if (open) {
      fetchDocuments();
    }
  }, [open, fetchDocuments]);

  const handleRagFileUpload = useCallback(async () => {
    const input = ragFileInputRef.current;
    if (!input?.files?.length) return;

    const files = Array.from(input.files);
    setUploadingFile(files[0].name);

    try {
      for (const file of files) {
        // Step 1: Extract text
        const uploadResponse = await fetch(
          `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/files/upload`,
          {
            method: "POST",
            body: (() => {
              const fd = new FormData();
              fd.append("file", file);
              return fd;
            })(),
          }
        );

        if (!uploadResponse.ok) {
          throw new Error("Failed to process file");
        }

        const { text, name } = await uploadResponse.json();

        // Step 2: Index in RAG
        if (text) {
          const ragResponse = await fetch(
            `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/files/index-rag`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chatId, fileName: name, text }),
            }
          );

          if (!ragResponse.ok) {
            throw new Error("Failed to index in RAG");
          }
        }

        toast.success(`"${name}" добавлен в RAG`);
      }

      fetchDocuments();
    } catch (error) {
      toast.error("Не удалось загрузить файл в RAG");
    } finally {
      setUploadingFile(null);
      if (input) input.value = "";
    }
  }, [chatId, fetchDocuments]);

  const handleDelete = async (fileName: string) => {
    setDeletingFile(fileName);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/rag-documents?chatId=${chatId}&fileName=${encodeURIComponent(fileName)}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        throw new Error("Failed to delete document");
      }

      setDocuments((prev) => prev.filter((d) => d.fileName !== fileName));
      toast.success(`Документ "${fileName}" удалён из RAG`);
    } catch (error) {
      toast.error("Не удалось удалить документ");
    } finally {
      setDeletingFile(null);
    }
  };

  const formatDistance = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "только что";
    if (diffMins < 60) return `${diffMins} мин. назад`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} ч. назад`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} дн. назад`;
  };

  return (
    <>
      <input
        type="file"
        className="hidden"
        ref={ragFileInputRef}
        multiple
        onChange={handleRagFileUpload}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            className={cn(
              "h-7 w-7 rounded-lg border border-border/40 p-1 transition-colors",
              "text-foreground hover:border-border hover:text-foreground"
            )}
            variant="ghost"
            title="Документы в RAG"
          >
            <DatabaseIcon size={14} />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-80 p-0"
          align="start"
          side="top"
          sideOffset={8}
        >
          <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
            <DatabaseIcon size={14} className="text-muted-foreground" />
            <span className="text-sm font-medium">Документы в RAG</span>
            {documents.length > 0 && (
              <span className="ml-auto text-xs text-muted-foreground">
                {documents.length}
              </span>
          )}
        </div>

        <div className="max-h-64 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Spinner className="size-4" />
              Загрузка...
            </div>
          ) : documents.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <FileTextIcon
                size={24}
                className="text-muted-foreground/50"
              />
              <p className="text-sm text-muted-foreground">
                Нет загруженных документов
              </p>
              <p className="text-xs text-muted-foreground/70">
                Прикрепите файл к сообщению
              </p>
            </div>
          ) : (
            <div className="flex flex-col">
              {documents.map((doc) => (
                <div
                  key={doc.fileName}
                  className="flex items-center gap-2 px-3 py-2.5 hover:bg-muted/50 transition-colors"
                >
                  <FileTextIcon
                    size={16}
                    className="shrink-0 text-muted-foreground"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {doc.fileName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {doc.chunkCount} чанков •{" "}
                      {formatDistance(doc.createdAt)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(doc.fileName)}
                    disabled={deletingFile === doc.fileName}
                  >
                    {deletingFile === doc.fileName ? (
                      <Spinner className="size-3" />
                    ) : (
                      <TrashIcon size={14} />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border/50 px-3 py-2">
          <Button
            className="w-full gap-2"
            size="sm"
            variant="outline"
            onClick={() => ragFileInputRef.current?.click()}
            disabled={!!uploadingFile}
          >
            {uploadingFile ? (
              <>
                <Spinner className="size-3" />
                <span className="truncate">Обработка...</span>
              </>
            ) : (
              <>
                <UploadIcon className="size-3.5" />
                <span>Добавить файл в RAG</span>
              </>
            )}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
    </>
  );
}
