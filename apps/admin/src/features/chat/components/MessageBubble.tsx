import { useState } from "react";
import { MoreHorizontal, Copy, Pencil, Trash2, Check, X } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import { ConfirmDialog } from "@repo/ui/components/ui/confirm-dialog";
import { toast } from "sonner";
import type { Message } from "../types/chat.types";

const EDIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const DELETE_WINDOW_MS = 2 * 24 * 60 * 60 * 1000; // 2 days

type Props = {
  message: Message;
  isSelf: boolean;
  onEdit?: (messageId: string, content: string) => void;
  onDelete?: (messageId: string) => void;
};

const roleColors: Record<string, string> = {
  admin: "text-purple-600",
  super_admin: "text-red-600",
  operator: "text-green-600",
  visitor: "text-blue-600",
};

const roleLabels: Record<string, string> = {
  admin: "Admin",
  super_admin: "Super Admin",
  operator: "Operator",
  visitor: "Visitor",
};

export function MessageBubble({ message, isSelf, onEdit, onDelete }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (message.type === "system") {
    return (
      <div className="text-center">
        <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
          {message.content}
        </span>
      </div>
    );
  }

  if (message.isDeleted) {
    return (
      <div className={`flex flex-col ${isSelf ? "items-end" : "items-start"}`}>
        <div className="max-w-[70%] px-3 py-2 rounded-xl text-sm leading-relaxed bg-muted/50 rounded-bl-sm">
          <span className="italic text-muted-foreground text-[13px]">
            This message was deleted
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground mt-0.5 px-1">
          {formatTime(message.createdAt)}
        </span>
      </div>
    );
  }

  const roleLabel = message.senderRole ? roleLabels[message.senderRole] : null;
  const roleColor = message.senderRole ? roleColors[message.senderRole] : "";

  const canDelete =
    isSelf &&
    Date.now() - new Date(message.createdAt).getTime() < DELETE_WINDOW_MS;
  const canEdit =
    isSelf &&
    Date.now() - new Date(message.createdAt).getTime() < EDIT_WINDOW_MS;

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    toast.success("Message copied");
  };

  const handleStartEdit = () => {
    setEditContent(message.content);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    const trimmed = editContent.trim();
    if (trimmed && trimmed !== message.content) {
      onEdit?.(message.id, trimmed);
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditContent(message.content);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    }
    if (e.key === "Escape") {
      handleCancelEdit();
    }
  };

  const handleConfirmDelete = () => {
    onDelete?.(message.id);
    setShowDeleteConfirm(false);
  };

  return (
    <div className={`group w-full flex flex-col ${isSelf ? "items-end" : "items-start"}`}>
      {!isSelf && (
        <div className="flex items-center gap-1.5 mb-0.5 px-1">
          {message.senderName && (
            <span className="text-[11px] font-medium text-muted-foreground">
              {message.senderName}
            </span>
          )}
          {roleLabel && (
            <span className={`text-[10px] font-medium ${roleColor}`}>
              {roleLabel}
            </span>
          )}
        </div>
      )}

      <div className={`flex items-center gap-1 max-w-[70%] ${isSelf ? "flex-row-reverse" : "flex-row"}`}>
        <div
          className={`flex-1 min-w-0 px-3 py-2 rounded-xl text-sm leading-relaxed ${
            isSelf
              ? "bg-primary text-primary-foreground rounded-br-sm"
              : "bg-muted rounded-bl-sm"
          }`}
        >
          {isEditing ? (
            <div className="flex flex-col gap-1.5">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full min-h-[36px] max-h-[120px] resize-none rounded-md border bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                autoFocus
              />
              <div className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={handleCancelEdit}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={handleSaveEdit}
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <>
              {message.content}
              {message.editedAt && (
                <span className={`text-[10px] ml-1.5 italic ${isSelf ? "opacity-70" : "text-muted-foreground"}`}>
                  (edited)
                </span>
              )}
            </>
          )}
        </div>

        {!isEditing && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isSelf ? "end" : "start"} className="w-36">
              <DropdownMenuItem onSelect={handleCopy} className="cursor-pointer">
                <Copy className="mr-2 h-3.5 w-3.5" />
                Copy
              </DropdownMenuItem>
              {canEdit && (
                <DropdownMenuItem onSelect={handleStartEdit} className="cursor-pointer">
                  <Pencil className="mr-2 h-3.5 w-3.5" />
                  Edit
                </DropdownMenuItem>
              )}
              {canDelete && (
                <DropdownMenuItem
                  onSelect={() => setShowDeleteConfirm(true)}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <span className="text-[10px] text-muted-foreground mt-0.5 px-1">
        {formatTime(message.createdAt)}
      </span>

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Delete message"
        description="Are you sure you want to delete this message? This action cannot be undone."
        onConfirm={handleConfirmDelete}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="destructive"
      />
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}
