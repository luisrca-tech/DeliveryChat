import { useState, useEffect, useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Conversation, ChatClient } from "../chat-client";

interface NewFormState {
  visible: boolean;
  subject: string;
  creating: boolean;
}

export interface UseConversationListOptions {
  client: ChatClient;
  captureVisitorId: (id: string) => void;
  onConversationCreated?: (id: string) => void;
}

export interface UseConversationListResult {
  conversations: Conversation[];
  setConversations: Dispatch<SetStateAction<Conversation[]>>;
  selectedId: string | null;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  loadingConvs: boolean;
  newForm: NewFormState;
  showNewForm: () => void;
  hideNewForm: () => void;
  setNewSubject: (subject: string) => void;
  handleCreateConversation: (e: React.FormEvent) => Promise<void>;
}

export function useConversationList({
  client,
  captureVisitorId,
  onConversationCreated,
}: UseConversationListOptions): UseConversationListResult {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [newForm, setNewForm] = useState<NewFormState>({ visible: false, subject: "", creating: false });

  useEffect(() => {
    setLoadingConvs(true);
    client
      .listConversations()
      .then(({ conversations: convs, visitorUserId: vid }) => {
        setConversations(convs);
        captureVisitorId(vid);
      })
      .catch(() => {})
      .finally(() => setLoadingConvs(false));
  }, [client, captureVisitorId]);

  const showNewForm = useCallback(() => setNewForm((f) => ({ ...f, visible: true })), []);

  const hideNewForm = useCallback(
    () => setNewForm({ visible: false, subject: "", creating: false }),
    [],
  );

  const setNewSubject = useCallback(
    (subject: string) => setNewForm((f) => ({ ...f, subject })),
    [],
  );

  const handleCreateConversation = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setNewForm((f) => {
        const subject = f.subject.trim() || undefined;
        void (async () => {
          try {
            const { conversation } = await client.createConversation(subject);
            const visitor = conversation.participants.find((p) => p.role === "visitor");
            if (visitor) captureVisitorId(visitor.userId);
            setConversations((prev) => [conversation, ...prev]);
            if (onConversationCreated) {
              onConversationCreated(conversation.id);
            } else {
              setSelectedId(conversation.id);
            }
            setNewForm({ visible: false, subject: "", creating: false });
          } catch {
            setNewForm((prev) => ({ ...prev, creating: false }));
          }
        })();
        return { ...f, creating: true };
      });
    },
    [client, captureVisitorId, onConversationCreated],
  );

  return {
    conversations,
    setConversations,
    selectedId,
    setSelectedId,
    loadingConvs,
    newForm,
    showNewForm,
    hideNewForm,
    setNewSubject,
    handleCreateConversation,
  };
}
