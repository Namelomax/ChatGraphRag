import Link from "next/link";
import { memo } from "react";
import { toast } from "sonner";
import type { Chat } from "@/lib/db/schema";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "../ui/sidebar";
import {
  MoreHorizontalIcon,
  PencilEditIcon,
  TrashIcon,
} from "./icons";

const PureChatItem = ({
  chat,
  isActive,
  onDelete,
  setOpenMobile,
}: {
  chat: Chat;
  isActive: boolean;
  onDelete: (chatId: string) => void;
  setOpenMobile: (open: boolean) => void;
}) => {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        className="h-8 rounded-none text-[13px] text-sidebar-foreground/50 transition-all duration-150 hover:bg-transparent hover:text-sidebar-foreground data-active:bg-transparent data-active:font-normal data-active:text-sidebar-foreground/50 data-[active=true]:text-sidebar-foreground data-[active=true]:font-medium data-[active=true]:border-b data-[active=true]:border-dashed data-[active=true]:border-sidebar-foreground/50"
        isActive={isActive}
      >
        <Link
          href={`/chat/${chat.id}`}
          onClick={(event) => {
            const activeStreamChatId = window.sessionStorage.getItem(
              "active-stream-chat-id"
            );
            if (activeStreamChatId && activeStreamChatId !== chat.id) {
              event.preventDefault();
              toast.error("Дождитесь завершения текущего ответа перед переключением чата");
              return;
            }
            setOpenMobile(false);
          }}
        >
          <span className="truncate">{chat.title}</span>
        </Link>
      </SidebarMenuButton>

      <DropdownMenu modal={true}>
        <DropdownMenuTrigger asChild>
          <SidebarMenuAction
            className="mr-0.5 rounded-md text-sidebar-foreground/50 ring-0 transition-colors duration-150 focus-visible:ring-0 hover:text-sidebar-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            showOnHover={!isActive}
          >
            <MoreHorizontalIcon />
            <span className="sr-only">Действия</span>
          </SidebarMenuAction>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" side="bottom">
          <DropdownMenuItem
            onSelect={async () => {
              const nextTitle = window.prompt("Введите новое название чата", chat.title);
              if (!nextTitle || nextTitle.trim().length === 0) {
                return;
              }
              await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/chat`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: chat.id, title: nextTitle.trim() }),
              });
              window.location.reload();
            }}
          >
            <PencilEditIcon />
            <span>Переименовать</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            onSelect={() => onDelete(chat.id)}
            variant="destructive"
          >
            <TrashIcon />
            <span>Удалить</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
};

export const ChatItem = memo(PureChatItem, (prevProps, nextProps) => {
  if (prevProps.isActive !== nextProps.isActive) {
    return false;
  }
  return true;
});
