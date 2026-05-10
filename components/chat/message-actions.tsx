import equal from "fast-deep-equal";
import { memo } from "react";
import { toast } from "sonner";
import type { ChatMessage } from "@/lib/types";
import { copyTextToClipboard } from "@/lib/utils/copy-to-clipboard";
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

    const ok = await copyTextToClipboard(textFromParts);
    if (ok) {
      toast.success("Скопировано");
    } else {
      toast.error("Не удалось скопировать (нет доступа к буферу обмена)");
    }
  };

  if (message.role === "user") {
    return (
      <Actions className="-mr-0.5 justify-end opacity-0 transition-opacity duration-150 group-hover/message:opacity-100">
        <div className="flex items-center gap-0.5">
          {onEdit && (
            <Action
              className="size-8 shrink-0 text-foreground/75 hover:bg-muted hover:text-foreground [&_svg]:size-4"
              data-testid="message-edit-button"
              onClick={onEdit}
              tooltip="Редактировать"
            >
              <PencilEditIcon />
            </Action>
          )}
          <Action
            className="size-8 shrink-0 text-foreground/75 hover:bg-muted hover:text-foreground [&_svg]:size-4"
            onClick={handleCopy}
            tooltip="Копировать"
          >
            <CopyIcon />
          </Action>
          {onRegenerate && (
            <Action
              className="size-8 shrink-0 text-foreground/75 hover:bg-muted hover:text-foreground [&_svg]:size-4"
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
        className="size-8 shrink-0 text-foreground/75 hover:bg-muted hover:text-foreground [&_svg]:size-4"
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
  (prevProps, nextProps) =>
    prevProps.isLoading === nextProps.isLoading &&
    prevProps.message.id === nextProps.message.id &&
    prevProps.onEdit === nextProps.onEdit &&
    prevProps.onRegenerate === nextProps.onRegenerate &&
    equal(prevProps.message.parts, nextProps.message.parts)
);
