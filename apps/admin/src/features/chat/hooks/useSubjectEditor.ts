import { useState, useRef } from "react";
import { toast } from "sonner";
import { useUpdateSubjectMutation } from "./useConversationMutations";
import type { ConversationWithParticipants } from "../types/chat.types";

export function useSubjectEditor(conversation: ConversationWithParticipants) {
  const updateSubjectMutation = useUpdateSubjectMutation();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const startEditing = () => {
    setDraft(conversation.subject ?? "");
    setIsEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setDraft("");
  };

  const saveSubject = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    updateSubjectMutation.mutate(
      { id: conversation.id, subject: trimmed },
      {
        onSuccess: () => {
          setIsEditing(false);
          toast.success("Subject updated");
        },
        onError: () => toast.error("Failed to update subject"),
      },
    );
  };

  return {
    isEditing,
    draft,
    setDraft,
    startEditing,
    cancelEditing,
    saveSubject,
    inputRef,
    isPending: updateSubjectMutation.isPending,
  };
}
