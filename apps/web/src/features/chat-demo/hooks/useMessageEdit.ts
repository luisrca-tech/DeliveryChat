import { useState, useCallback } from "react";
import type { ContentFormat } from "@repo/types";
import type { ChatClient } from "../chat-client";
import type { OptimisticMessage } from "../lib/wsMessageReducer";
import { resolveContentFormat } from "../lib/isLexicalMessage";

const EDIT_WINDOW_MS = 15 * 60 * 1000;

export type EditingState = {
  id: string;
  content: string;
  contentFormat: ContentFormat;
  saving: boolean;
} | null;

export type ReplaceMessageFn = (
  id: string,
  content: string,
  editedAt: string,
  contentFormat?: ContentFormat,
  contentHtml?: string | null,
) => void;

function withinEditWindow(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() < EDIT_WINDOW_MS;
}

export function useMessageEdit(
  client: ChatClient,
  onReplace: ReplaceMessageFn,
  onRemove: (id: string) => void,
) {
  const [editingState, setEditingState] = useState<EditingState>(null);

  const handleStartEdit = useCallback((msg: OptimisticMessage) => {
    setEditingState({
      id: msg.id,
      content: msg.content,
      contentFormat: resolveContentFormat(msg),
      saving: false,
    });
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingState(null);
  }, []);

  const setEditingContent = useCallback((content: string) => {
    setEditingState((prev) => (prev ? { ...prev, content } : null));
  }, []);

  const handleSaveEdit = useCallback(
    async (
      msg: OptimisticMessage,
      contentOverride?: string,
      contentFormatOverride?: ContentFormat,
    ) => {
      const contentFormat =
        contentFormatOverride ??
        editingState?.contentFormat ??
        resolveContentFormat(msg);
      const content = (contentOverride ?? editingState?.content ?? "").trim();

      if (!content || !withinEditWindow(msg.createdAt)) {
        setEditingState(null);
        return;
      }

      if (content === msg.content) {
        setEditingState(null);
        return;
      }

      setEditingState((prev) => (prev ? { ...prev, saving: true } : null));
      try {
        const { message: updated } = await client.editMessage(
          msg.conversationId,
          msg.id,
          content,
          contentFormat,
        );
        onReplace(
          msg.id,
          updated.content,
          updated.editedAt ?? new Date().toISOString(),
          updated.contentFormat,
          updated.contentHtml,
        );
        setEditingState(null);
      } catch {
        setEditingState((prev) => (prev ? { ...prev, saving: false } : null));
      }
    },
    [client, editingState, onReplace],
  );

  const handleDelete = useCallback(
    async (msg: OptimisticMessage) => {
      try {
        await client.deleteMessage(msg.conversationId, msg.id);
        onRemove(msg.id);
      } catch {
        // silently ignore
      }
    },
    [client, onRemove],
  );

  return {
    editingState,
    handleStartEdit,
    handleCancelEdit,
    setEditingContent,
    handleSaveEdit,
    handleDelete,
  };
}
