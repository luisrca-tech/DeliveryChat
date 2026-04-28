import { useState, useRef } from "react";
import { MessageSquare, LogOut, CheckCircle, MoreVertical, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { ConfirmDialog } from "@repo/ui/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import { useUpdateSubjectMutation } from "../hooks/useConversationMutations";
import { useLeaveAction, useResolveAction } from "../hooks/useConversationActions";
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
  const leaveAction = useLeaveAction();
  const resolveAction = useResolveAction();
  const updateSubjectMutation = useUpdateSubjectMutation();
  const [isLeaveDialogOpen, setIsLeaveDialogOpen] = useState(false);
  const [isResolveDialogOpen, setIsResolveDialogOpen] = useState(false);
  const [isEditingSubject, setIsEditingSubject] = useState(false);
  const [subjectDraft, setSubjectDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const isAssigned = conversation.assignedTo === currentUserId;
  const canManage = isAssigned;

  const startEditing = () => {
    setSubjectDraft(conversation.subject ?? "");
    setIsEditingSubject(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const cancelEditing = () => {
    setIsEditingSubject(false);
    setSubjectDraft("");
  };

  const saveSubject = () => {
    const trimmed = subjectDraft.trim();
    if (!trimmed) return;
    updateSubjectMutation.mutate(
      { id: conversation.id, subject: trimmed },
      {
        onSuccess: () => {
          setIsEditingSubject(false);
          toast.success("Subject updated");
        },
        onError: () => toast.error("Failed to update subject"),
      },
    );
  };

  const handleLeave = async () => {
    const ok = await leaveAction.execute(conversation.id);
    if (ok) setIsLeaveDialogOpen(false);
  };

  const handleResolve = async () => {
    const ok = await resolveAction.execute(conversation.id);
    if (ok) setIsResolveDialogOpen(false);
  };

  return (
    <div className="h-14 px-4 flex items-center gap-3 border-b border-border bg-card/50 shrink-0">
      <MessageSquare className="h-4 w-4 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        {isEditingSubject ? (
          <div className="flex items-center gap-1">
            <Input
              ref={inputRef}
              value={subjectDraft}
              onChange={(e) => setSubjectDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveSubject();
                if (e.key === "Escape") cancelEditing();
              }}
              className="h-7 text-sm w-1/2"
              maxLength={500}
              disabled={updateSubjectMutation.isPending}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={saveSubject}
              disabled={!subjectDraft.trim() || updateSubjectMutation.isPending}
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={cancelEditing}
              disabled={updateSubjectMutation.isPending}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1 group">
            <span className="text-sm font-medium truncate">
              {conversation.subject ?? "No subject"}
            </span>
            {isAssigned && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={startEditing}
              >
                <Pencil className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </div>
      <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusClass}`}>
        {conversation.status}
      </span>

      {canManage && conversation.status === "active" && (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="cursor-pointer"
                onSelect={(event) => {
                  event.preventDefault();
                  setIsLeaveDialogOpen(true);
                }}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Leave Chat
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer"
                onSelect={(event) => {
                  event.preventDefault();
                  if (!conversation.subject) {
                    toast.warning("Please update the conversation subject before marking as solved");
                    startEditing();
                    return;
                  }
                  setIsResolveDialogOpen(true);
                }}
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Mark as Solved
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <ConfirmDialog
            open={isLeaveDialogOpen}
            onOpenChange={setIsLeaveDialogOpen}
            title="Leave chat"
            description="Are you sure you want to leave this conversation and return it to the queue?"
            onConfirm={handleLeave}
            confirmLabel="Leave Chat"
            variant="destructive"
            isLoading={leaveAction.isPending}
          />

          <ConfirmDialog
            open={isResolveDialogOpen}
            onOpenChange={setIsResolveDialogOpen}
            title="Mark as solved"
            description="Are you sure you want to mark this conversation as solved?"
            onConfirm={handleResolve}
            confirmLabel="Mark as Solved"
            isLoading={resolveAction.isPending}
          />
        </>
      )}
    </div>
  );
}
