import { useState, useRef, useCallback, useMemo } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/ui/alert-dialog";
import type { OptimisticMessage } from "../lib/wsMessageReducer";
import { createChatClient } from "../chat-client";
import { resolveVisitorId } from "../visitor";
import { useEditWindowTicker } from "../hooks/useEditWindowTicker";
import { useLocalMessageSync } from "../hooks/useLocalMessageSync";
import { useVisitorUserId } from "../hooks/useVisitorUserId";
import { useUnreadCounts } from "../hooks/useUnreadCounts";
import { useMessageEdit } from "../hooks/useMessageEdit";
import { useMessageInput } from "../hooks/useMessageInput";
import { useTypingIndicator } from "../hooks/useTypingIndicator";
import { useWebSocketDispatch } from "../hooks/useWebSocketDispatch";
import { useWebSocketConnection } from "../hooks/useWebSocketConnection";
import { useConversationList } from "../hooks/useConversationList";
import { useMessageHistory } from "../hooks/useMessageHistory";
import { useHumanHandoff } from "../hooks/useHumanHandoff";
import { useWidgetSettings } from "../hooks/useWidgetSettings";
import { useAiDisclosure } from "../hooks/useAiDisclosure";
import type { EditorHandle } from "@repo/lexical-utils/react";
import {
  ConversationListPanel,
  MessageThreadPanel,
} from "./ChatDemoComponents";

interface ChatDemoIslandProps {
  apiUrl: string;
  apiKey: string;
  appId: string;
}

export function ChatDemoIsland({ apiUrl, apiKey, appId }: ChatDemoIslandProps) {
  const clientRef = useRef(
    createChatClient({ apiUrl, apiKey, appId, visitorId: resolveVisitorId() }),
  );

  // onMessageRef breaks the circular dep between useWebSocketDispatch (needs wsRef) and
  // useWebSocketConnection (needs handleWsMessage). Populated right after dispatch is created.
  const onMessageRef = useRef<(e: MessageEvent) => void>(() => {});

  const [operatorTypingName, setOperatorTypingName] = useState<string | null>(
    null,
  );
  const [messageToDelete, setMessageToDelete] =
    useState<OptimisticMessage | null>(null);

  const onConversationCreatedRef = useRef<(id: string) => void>(() => {});
  const stableOnConversationCreated = useMemo(
    () => (id: string) => onConversationCreatedRef.current(id),
    [],
  );

  // --- Leaf hooks ---
  useEditWindowTicker();
  const { getLastMessageId, setLastMessageId } = useLocalMessageSync();
  const { visitorUserId, captureVisitorId } = useVisitorUserId();
  const { unreadCounts, setUnreadCounts, clearUnread, refreshUnread } =
    useUnreadCounts(clientRef.current);

  // --- Data hooks ---
  const {
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
  } = useConversationList({
    client: clientRef.current,
    captureVisitorId,
    onConversationCreated: stableOnConversationCreated,
  });

  const {
    messages,
    setMessages,
    loadingMsgs,
    messagesEndRef,
    appendMessage,
    replaceMessage,
    removeMessage,
    rollbackMessage,
  } = useMessageHistory({
    selectedId,
    client: clientRef.current,
    setLastMessageId,
    clearUnread,
  });

  // --- Edit hook ---
  const {
    editingState,
    handleStartEdit,
    handleCancelEdit,
    setEditingContent,
    handleSaveEdit,
    handleDelete,
  } = useMessageEdit(clientRef.current, replaceMessage, removeMessage);

  // --- WebSocket hooks ---
  const onMarkAsRead = useCallback(
    (conversationId: string, messageId: string) => {
      clientRef.current.markAsRead(conversationId, messageId).catch(() => {});
    },
    [],
  );

  const { wsRef, wsStatus, conversationClosedRef, selectedIdRef } =
    useWebSocketConnection({
      selectedId,
      client: clientRef.current,
      getLastMessageId,
      onMessageRef,
      onResetTyping: useCallback(() => setOperatorTypingName(null), []),
    });

  const { handleWsMessage } = useWebSocketDispatch({
    wsRef,
    conversationClosedRef,
    selectedIdRef,
    messages,
    conversations,
    operatorTypingName,
    setMessages,
    setConversations,
    setOperatorTypingName,
    setLastMessageId,
    onMarkAsRead,
    refreshUnread,
  });

  onMessageRef.current = handleWsMessage;

  // --- Input hooks ---
  const editorHandleRef = useRef<EditorHandle | null>(null);

  const {
    sending,
    error: sendError,
    handleSend,
  } = useMessageInput(
    wsRef,
    selectedId,
    visitorUserId,
    appendMessage,
    rollbackMessage,
  );

  const { notifyTyping, sendTypingStop } = useTypingIndicator(
    wsRef,
    selectedId,
  );

  const onTypingStart = useCallback(() => {
    notifyTyping();
  }, [notifyTyping]);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, msg: OptimisticMessage) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSaveEdit(msg);
      }
      if (e.key === "Escape") handleCancelEdit();
    },
    [handleSaveEdit, handleCancelEdit],
  );

  // --- Coordination handlers ---
  function handleSelectConversation(id: string) {
    if (editingState) handleCancelEdit();
    conversationClosedRef.current = false;
    setSelectedId(id);
    setOperatorTypingName(null);
    setUnreadCounts((prev) => ({ ...prev, [id]: 0 }));
    sendTypingStop();
  }

  onConversationCreatedRef.current = handleSelectConversation;

  const selectedConversation = conversations.find((c) => c.id === selectedId);

  const { aiEnabled, settings } = useWidgetSettings(clientRef.current);

  const {
    hidden: handoffHidden,
    disabled: handoffDisabled,
    error: handoffError,
    requestHuman,
  } = useHumanHandoff({
    client: clientRef.current,
    aiEnabled,
    conversation: selectedConversation,
    messages,
    visitorUserId,
  });

  const disclosure = useAiDisclosure({
    aiEnabled,
    settings,
    conversationId: selectedId,
    messageCount: messages.length,
    loadingMessages: loadingMsgs,
  });

  // Client-side only — pinned above real history, never sent to the server.
  const displayMessages = useMemo(
    () => (disclosure ? [disclosure, ...messages] : messages),
    [disclosure, messages],
  );

  return (
    <div className="relative w-full h-full flex overflow-hidden bg-background text-foreground font-sans">
      {!selectedConversation && (
        <div
          className="pointer-events-none absolute bottom-4 right-4 z-10 bg-card rounded-lg shadow-2xl p-4 border border-border animate-scale-in"
          style={{ animationDelay: "0.5s" }}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="h-2 w-2 rounded-full bg-primary animate-glow" />
            <span className="text-xs font-medium">Live Chat Active</span>
          </div>
          <div className="text-xs text-muted-foreground">
            Chat with our team...
          </div>
        </div>
      )}
      <ConversationListPanel
        conversations={conversations}
        selectedId={selectedId}
        loadingConvs={loadingConvs}
        unreadCounts={unreadCounts}
        newForm={newForm}
        onSelect={handleSelectConversation}
        showNewForm={showNewForm}
        hideNewForm={hideNewForm}
        setNewSubject={setNewSubject}
        handleCreateConversation={handleCreateConversation}
      />
      <MessageThreadPanel
        messages={displayMessages}
        conversation={selectedConversation}
        wsStatus={wsStatus}
        loadingMsgs={loadingMsgs}
        visitorUserId={visitorUserId}
        operatorTypingName={operatorTypingName}
        sendError={sendError}
        sending={sending}
        editingState={editingState}
        messagesEndRef={messagesEndRef}
        editorHandleRef={editorHandleRef}
        handleSend={handleSend}
        onTypingStart={onTypingStart}
        onTypingStop={sendTypingStop}
        handleStartEdit={handleStartEdit}
        handleCancelEdit={handleCancelEdit}
        setEditingContent={setEditingContent}
        handleSaveEdit={handleSaveEdit}
        onRequestDelete={setMessageToDelete}
        handleEditKeyDown={handleEditKeyDown}
        handoffHidden={handoffHidden}
        handoffDisabled={handoffDisabled}
        handoffError={handoffError}
        onRequestHuman={requestHuman}
        aiAssistantLabel={settings.ai?.assistantLabel}
      />

      <AlertDialog
        open={messageToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setMessageToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete message?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (messageToDelete) {
                  void handleDelete(messageToDelete);
                  setMessageToDelete(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
