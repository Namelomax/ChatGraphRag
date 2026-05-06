import equal from "fast-deep-equal";
import { memo } from "react";
import { toast } from "sonner";
import { useCopyToClipboard } from "usehooks-ts";
import type { ChatMessage } from "@/lib/types";
import {
  MessageAction as Action,
  MessageActions as Actions,
} from "../ai-elements/message";
import { CopyIcon, PencilEditIcon, UndoIcon } from "./icons";

export function PureMessageActions({
  message,
  isLoading,
  onEdit,
  onRegenerate,
}: {
  message: ChatMessage;
  isLoading: boolean;
  onEdit?: () => void;
  onRegenerate?: () => void;
}) {
  const [_, copyToClipboard] = useCopyToClipboard();

  if (isLoading) {
    return null;
  }

  const textFromParts = message.parts
    ?.filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();

  const handleCopy = async () => {
    if (!textFromParts) {
      toast.error("Нет текста для копирования");
      return;
    }

    await copyToClipboard(textFromParts);
    toast.success("Скопировано");
  };

  if (message.role === "user") {
    return (
      <Actions className="-mr-0.5 justify-end opacity-0 transition-opacity duration-150 group-hover/message:opacity-100">
        <div className="flex items-center gap-0.5">
          {onEdit && (
            <Action
              className="size-7 text-muted-foreground/50 hover:text-foreground"
              data-testid="message-edit-button"
              onClick={onEdit}
              tooltip="Редактировать"
            >
              <PencilEditIcon />
            </Action>
          )}
          <Action
            className="size-7 text-muted-foreground/50 hover:text-foreground"
            onClick={handleCopy}
            tooltip="Копировать"
          >
            <CopyIcon />
          </Action>
          {onRegenerate && (
            <Action
              className="size-7 text-muted-foreground/50 hover:text-foreground"
              onClick={onRegenerate}
              tooltip="Отправить заново"
            >
              <UndoIcon />
            </Action>
          )}
        </div>
      </Actions>
    );
  }

  return (
    <Actions className="-ml-0.5 opacity-0 transition-opacity duration-150 group-hover/message:opacity-100">
      <Action
        className="text-muted-foreground/50 hover:text-foreground"
        onClick={handleCopy}
        tooltip="Копировать"
      >
        <CopyIcon />
      </Action>
    </Actions>
  );
}

export const MessageActions = memo(
  PureMessageActions,
  (prevProps, nextProps) => {
    if (prevProps.isLoading !== nextProps.isLoading) {
      return false;
    }

    return true;
  }
);
