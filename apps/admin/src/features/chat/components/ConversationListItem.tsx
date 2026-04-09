import { MessageSquare } from "lucide-react";
import type { Conversation } from "../types/chat.types";

type Props = {
  conversation: Conversation;
  isSelected: boolean;
  onClick: () => void;
  appName?: string;
  assignedToName?: string;
};

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  active: "bg-green-100 text-green-700",
  closed: "bg-gray-100 text-gray-600",
};

export function ConversationListItem({ conversation, isSelected, onClick, appName, assignedToName }: Props) {
  const statusClass = statusColors[conversation.status] ?? "bg-gray-100 text-gray-600";

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b border-border/40 hover:bg-accent/50 transition-colors ${
        isSelected ? "bg-accent" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <MessageSquare className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">
              {conversation.subject ?? "No subject"}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${statusClass}`}>
              {conversation.status}
            </span>
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
    </button>
  );
}
