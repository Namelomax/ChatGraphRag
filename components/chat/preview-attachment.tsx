import Image from "next/image";
import { FileSpreadsheetIcon, FileTextIcon, FileTypeIcon } from "lucide-react";
import type { Attachment } from "@/lib/types";
import { Spinner } from "../ui/spinner";
import { CrossSmallIcon } from "./icons";

export const PreviewAttachment = ({
  attachment,
  isUploading = false,
  onRemove,
}: {
  attachment: Attachment;
  isUploading?: boolean;
  onRemove?: () => void;
}) => {
  const { name, url, contentType } = attachment;
  const prettyName = name.split("/").at(-1) ?? name;
  const isSpreadsheet =
    contentType.includes("sheet") || /\.(xls|xlsx|csv)$/i.test(prettyName);
  const isTextLike =
    contentType.startsWith("text/") ||
    /\.(txt|md|json|doc|docx|pdf)$/i.test(prettyName);

  return (
    <div
      className="group relative h-24 w-32 shrink-0 overflow-hidden rounded-xl border border-border/40 bg-muted"
      data-testid="input-attachment-preview"
    >
      {contentType?.startsWith("image") ? (
        <Image
          alt={name ?? "attachment"}
          className="size-full object-cover"
          height={96}
          src={url}
          width={96}
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-1 px-2 text-muted-foreground">
          {isSpreadsheet ? (
            <FileSpreadsheetIcon className="size-5" />
          ) : isTextLike ? (
            <FileTextIcon className="size-5" />
          ) : (
            <FileTypeIcon className="size-5" />
          )}
          <span className="line-clamp-2 text-center text-[11px] leading-tight">
            {prettyName}
          </span>
        </div>
      )}

      {isUploading && (
        <div
          className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40 backdrop-blur-sm"
          data-testid="input-attachment-loader"
        >
          <Spinner className="size-5" />
        </div>
      )}

      {onRemove && !isUploading && (
        <button
          className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/80 group-hover:opacity-100"
          onClick={onRemove}
          type="button"
        >
          <CrossSmallIcon size={10} />
        </button>
      )}
    </div>
  );
};
