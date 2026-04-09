import { MessageSquare, LogOut, CheckCircle, MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@repo/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import {
  useLeaveConversationMutation,
  useResolveConversationMutation,
} from "../hooks/useConversationMutations";
import type { ConversationWithParticipants } from "../types/chat.types";

type Props = {
  conversation: ConversationWithParticipants;
  currentUserId: string;
};

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  active: "bg-green-100 text-green-700",
  closed: "bg-gray-100 text-gray-600",
};

export function ChatHeader({ conversation, currentUserId }: Props) {
  const statusClass = statusColors[conversation.status] ?? "bg-gray-100 text-gray-600";
  const leaveMutation = useLeaveConversationMutation();
  const resolveMutation = useResolveConversationMutation();

  const isAssigned = conversation.assignedTo === currentUserId;
  const canManage = isAssigned;

  const handleLeave = async () => {
    try {
      await leaveMutation.mutateAsync(conversation.id);
      toast.success("Left conversation — returned to queue");
    } catch {
      toast.error("Failed to leave conversation");
    }
  };

  const handleResolve = async () => {
    try {
      await resolveMutation.mutateAsync(conversation.id);
      toast.success("Conversation marked as solved");
    } catch {
      toast.error("Failed to resolve conversation");
    }
  };

  return (
    <div className="h-14 px-4 flex items-center gap-3 border-b border-border bg-card/50 shrink-0">
      <MessageSquare className="h-4 w-4 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium truncate block">
          {conversation.subject ?? "No subject"}
        </span>
      </div>
      <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusClass}`}>
        {conversation.status}
      </span>

      {canManage && conversation.status === "active" && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleLeave}>
              <LogOut className="mr-2 h-4 w-4" />
              Leave Chat
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleResolve}>
              <CheckCircle className="mr-2 h-4 w-4" />
              Mark as Solved
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
