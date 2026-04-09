import { MessageSquare, MoreVertical, Trash2 } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import type { Conversation } from "../types/chat.types";

type Props = {
  conversation: Conversation;
  isSelected: boolean;
  onClick: () => void;
  appName?: string;
  assignedToName?: string;
  canDelete?: boolean;
  onDelete?: (id: string) => void;
};

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  active: "bg-green-100 text-green-700",
  closed: "bg-gray-100 text-gray-600",
};

export function ConversationListItem({ conversation, isSelected, onClick, appName, assignedToName, canDelete, onDelete }: Props) {
  const statusClass = statusColors[conversation.status] ?? "bg-gray-100 text-gray-600";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      className={`w-full text-left px-4 py-3 border-b border-border/40 hover:bg-accent/50 transition-colors ${
        isSelected ? "bg-accent" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <MessageSquare className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <span className="text-sm font-medium truncate">
              {conversation.subject ?? "No subject"}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${statusClass}`}>
              {conversation.status}
            </span>
            {canDelete && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="-mr-1 ml-auto h-7 w-7 shrink-0"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onSelect={() => onDelete?.(conversation.id)}
                  >
                    <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-muted-foreground">
              {new Date(conversation.updatedAt).toLocaleDateString()}
            </span>
            {appName && (
              <span className="text-xs text-muted-foreground truncate max-w-[100px]" title={appName}>
                · {appName}
              </span>
            )}
          </div>
          {assignedToName && (
            <div className="mt-0.5">
              <span className="text-[11px] text-muted-foreground truncate block max-w-[200px]" title={`Assigned to: ${assignedToName}`}>
                Assigned to: {assignedToName}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
