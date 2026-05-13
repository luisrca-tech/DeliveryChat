import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { ScrollArea } from "@repo/ui/components/ui/scroll-area";
import { createChatClient } from "../chat-client";
import type { Conversation } from "../chat-client";
import { resolveVisitorId } from "../visitor";
import { wsMessageReducer } from "../lib/wsMessageReducer";
import type { OptimisticMessage } from "../lib/wsMessageReducer";
import { useEditWindowTicker } from "../hooks/useEditWindowTicker";
import { useLocalMessageSync } from "../hooks/useLocalMessageSync";
import { useVisitorUserId } from "../hooks/useVisitorUserId";
import { useUnreadCounts } from "../hooks/useUnreadCounts";
import { useMessageEdit } from "../hooks/useMessageEdit";
import { useMessageInput } from "../hooks/useMessageInput";
import { useTypingIndicator } from "../hooks/useTypingIndicator";
import { MessageCircle, Plus, X, Send, Wifi, WifiOff, Pencil, Trash2, Check } from "lucide-react";
import { cn } from "@repo/ui/lib/utils";

interface ChatDemoIslandProps {
  apiUrl: string;
  apiKey: string;
  appId: string;
}

type WsStatus = "connecting" | "connected" | "disconnected";

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

function StatusBadge({ status }: { status: string }) {
  const classes: Record<string, string> = {
    active: "bg-green-500/15 text-green-600 border-green-500/20",
    pending: "bg-yellow-500/15 text-yellow-600 border-yellow-500/20",
    closed: "bg-gray-500/15 text-gray-500 border-gray-500/20",
  };
  return (
    <span
      className={cn(
        "text-[9px] px-1 py-0.5 rounded border flex-shrink-0 capitalize",
        classes[status] ?? "bg-gray-500/15 text-gray-500 border-gray-500/20",
      )}
    >
      {status}
    </span>
  );
}

function ConnectionDot({ status }: { status: WsStatus }) {
  if (status === "connected") {
    return <Wifi className="h-3 w-3 text-green-500 flex-shrink-0" />;
  }
  if (status === "connecting") {
    return <Wifi className="h-3 w-3 text-yellow-500 flex-shrink-0 animate-pulse" />;
  }
  return <WifiOff className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />;
}

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex items-center justify-center h-4 min-w-[1rem] px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-semibold flex-shrink-0">
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function ChatDemoIsland({ apiUrl, apiKey, appId }: ChatDemoIslandProps) {
  const clientRef = useRef(createChatClient({ apiUrl, apiKey, appId, visitorId: resolveVisitorId() }));
  const wsRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const conversationClosedRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<OptimisticMessage[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [creating, setCreating] = useState(false);
  const [wsStatus, setWsStatus] = useState<WsStatus>("disconnected");
  const [operatorTypingName, setOperatorTypingName] = useState<string | null>(null);

  // Leaf hooks
  useEditWindowTicker();
  const { getLastMessageId, setLastMessageId } = useLocalMessageSync();
  const { visitorUserId, captureVisitorId } = useVisitorUserId();
  const { unreadCounts, setUnreadCounts, clearUnread, refreshUnread } = useUnreadCounts(clientRef.current);

  const replaceMessage = useCallback((id: string, content: string, editedAt: string) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content, editedAt } : m)));
  }, []);

  const removeMessage = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const { editingState, handleStartEdit, handleCancelEdit, setEditingContent, handleSaveEdit, handleDelete } =
    useMessageEdit(clientRef.current, replaceMessage, removeMessage);

  const appendMessage = useCallback((msg: OptimisticMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const rollbackMessage = useCallback((clientId: string) => {
    setMessages((prev) => prev.filter((m) => m.clientId !== clientId));
  }, []);

  const {
    value: inputValue,
    sending,
    error: sendError,
    handleInputChange: handleInputChangeBase,
    handleSend,
  } = useMessageInput(wsRef, selectedId, visitorUserId, appendMessage, rollbackMessage);

  const { notifyTyping, sendTypingStop } = useTypingIndicator(wsRef, selectedId);

  // Combine input change: update value + notify typing
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleInputChangeBase(e);
      notifyTyping();
    },
    [handleInputChangeBase, notifyTyping],
  );

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendTypingStop();
        void handleSend();
      }
    },
    [handleSend, sendTypingStop],
  );

  // Mirror reducer-managed state in a ref so handleWsMessage can read the latest committed
  // values without stale closures.
  const wsSliceRef = useRef({ messages, conversations, operatorTypingName });
  wsSliceRef.current = { messages, conversations, operatorTypingName };

  useEffect(() => {
    const client = clientRef.current;
    setLoadingConvs(true);
    client
      .listConversations()
      .then(({ conversations: convs, visitorUserId: vid }) => {
        setConversations(convs);
        captureVisitorId(vid);
      })
      .catch(() => {})
      .finally(() => setLoadingConvs(false));
  }, [captureVisitorId]);

  const handleWsMessage = useCallback((event: MessageEvent) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(event.data as string);
    } catch {
      return;
    }

    const wsEvent = parsed as { type: string; payload: Record<string, unknown> };
    const current = wsSliceRef.current;

    const { state: next, sideEffects } = wsMessageReducer(current, wsEvent, selectedIdRef.current);

    if (next.messages !== current.messages) setMessages(next.messages);
    if (next.conversations !== current.conversations) setConversations(next.conversations);
    if (next.operatorTypingName !== current.operatorTypingName) setOperatorTypingName(next.operatorTypingName);

    for (const effect of sideEffects) {
      switch (effect.kind) {
        case "close-socket":
          conversationClosedRef.current = true;
          wsRef.current?.close();
          wsRef.current = null;
          break;
        case "persist-last-message":
          setLastMessageId(effect.conversationId, effect.messageId);
          break;
        case "mark-as-read":
          clientRef.current.markAsRead(effect.conversationId, effect.messageId).catch(() => {});
          break;
        case "refresh-unread":
          void refreshUnread(effect.conversationId);
          break;
      }
    }
  }, [setLastMessageId, refreshUnread]);

  useEffect(() => {
    selectedIdRef.current = selectedId;

    wsRef.current?.close();
    wsRef.current = null;
    if (pingRef.current) clearInterval(pingRef.current);
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectAttemptRef.current = 0;
    setWsStatus("disconnected");
    setOperatorTypingName(null);

    if (!selectedId) return;

    const client = clientRef.current;
    let cancelled = false;

    async function connect() {
      if (cancelled) return;
      setWsStatus("connecting");

      let ws: WebSocket | null = null;
      try {
        const { token } = await client.getWsToken();
        if (cancelled) return;

        ws = await client.connectWebSocket(token);
        if (cancelled) {
          ws.close();
          return;
        }

        wsRef.current = ws;
        reconnectAttemptRef.current = 0;
        setWsStatus("connected");

        const lastMessageId = getLastMessageId(selectedId!) ?? undefined;
        ws.send(
          JSON.stringify({
            type: "room:join",
            payload: { conversationId: selectedId, ...(lastMessageId ? { lastMessageId } : {}) },
          }),
        );

        pingRef.current = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, 30_000);

        ws.addEventListener("message", handleWsMessage);

        ws.addEventListener("close", () => {
          if (pingRef.current) clearInterval(pingRef.current);
          if (!cancelled) {
            setWsStatus("disconnected");
            scheduleReconnect();
          }
        });

        ws.addEventListener("error", () => {
          if (!cancelled) setWsStatus("disconnected");
        });
      } catch {
        if (!cancelled) scheduleReconnect();
      }
    }

    function scheduleReconnect() {
      if (cancelled || conversationClosedRef.current) return;
      const attempt = reconnectAttemptRef.current;
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS);
      reconnectAttemptRef.current = attempt + 1;
      reconnectTimerRef.current = setTimeout(() => void connect(), delay);
    }

    void connect();

    return () => {
      cancelled = true;
      wsRef.current?.close();
      wsRef.current = null;
      if (pingRef.current) clearInterval(pingRef.current);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [selectedId, handleWsMessage, getLastMessageId]);

  useEffect(() => {
    if (!selectedId) return;
    const client = clientRef.current;
    setLoadingMsgs(true);
    client
      .getMessages(selectedId)
      .then(({ messages: msgs }) => {
        const ordered = [...msgs].reverse();
        setMessages(ordered);
        const lastMsg = ordered[ordered.length - 1];
        if (lastMsg) {
          setLastMessageId(selectedId, lastMsg.id);
          client.markAsRead(selectedId, lastMsg.id).catch(() => {});
        }
        clearUnread(selectedId);
      })
      .catch(() => {})
      .finally(() => setLoadingMsgs(false));
  }, [selectedId, setLastMessageId, clearUnread]);

  useEffect(() => {
    const el = messagesEndRef.current;
    if (!el) return;
    const viewport = el.closest("[data-radix-scroll-area-viewport]");
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [messages]);

  function handleSelectConversation(id: string) {
    if (editingState) handleCancelEdit();
    conversationClosedRef.current = false;
    setSelectedId(id);
    setMessages([]);
    setOperatorTypingName(null);
    setUnreadCounts((prev) => ({ ...prev, [id]: 0 }));
    sendTypingStop();
  }

  async function handleCreateConversation(e: React.FormEvent) {
    e.preventDefault();
    const subject = newSubject.trim() || undefined;
    setCreating(true);
    try {
      const { conversation } = await clientRef.current.createConversation(subject);
      const visitor = conversation.participants.find((p) => p.role === "visitor");
      if (visitor) captureVisitorId(visitor.userId);
      setConversations((prev) => [conversation, ...prev]);
      setSelectedId(conversation.id);
      setMessages([]);
      setShowNewForm(false);
      setNewSubject("");
    } catch {
      // silently ignore
    } finally {
      setCreating(false);
    }
  }

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, msg: OptimisticMessage) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSaveEdit(msg);
      }
      if (e.key === "Escape") {
        handleCancelEdit();
      }
    },
    [handleSaveEdit, handleCancelEdit],
  );

  const selectedConversation = conversations.find((c) => c.id === selectedId);
  const showLiveChatBadge = !selectedConversation;

  return (
    <div className="relative w-full h-full flex overflow-hidden bg-background text-foreground font-sans">
      {showLiveChatBadge && (
        <div
          className="pointer-events-none absolute bottom-4 right-4 z-10 bg-card rounded-lg shadow-2xl p-4 border border-border animate-scale-in"
          style={{ animationDelay: "0.5s" }}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="h-2 w-2 rounded-full bg-primary animate-glow" />
            <span className="text-xs font-medium">Live Chat Active</span>
          </div>
          <div className="text-xs text-muted-foreground">Chat with our team...</div>
        </div>
      )}
      {/* Left panel — conversation list */}
      <div className="w-[240px] flex-shrink-0 border-r border-border flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-xs font-semibold text-foreground">Conversations</span>
          {!showNewForm && (
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => setShowNewForm(true)}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {showNewForm && (
          <form
            onSubmit={handleCreateConversation}
            className="p-2 border-b border-border space-y-1.5"
          >
            <Input
              autoFocus
              placeholder="Subject (optional)…"
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
              className="h-7 text-xs"
            />
            <div className="flex gap-1">
              <Button
                type="submit"
                size="sm"
                className="flex-1 h-6 text-xs"
                disabled={creating}
              >
                {creating ? "Creating…" : "Start chat"}
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => {
                  setShowNewForm(false);
                  setNewSubject("");
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </form>
        )}

        <ScrollArea className="flex-1">
          {loadingConvs ? (
            <div className="p-2 space-y-1.5">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 rounded-md bg-muted/50 animate-pulse" />
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-28 gap-2 text-muted-foreground">
              <MessageCircle className="h-5 w-5 opacity-30" />
              <p className="text-[11px] opacity-50">No conversations yet</p>
            </div>
          ) : (
            <div className="p-1.5 space-y-0.5">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv.id)}
                  className={cn(
                    "w-full text-left rounded-md px-2 py-1.5 hover:bg-accent/60 transition-colors",
                    selectedId === conv.id && "bg-accent",
                  )}
                >
                  <div className="flex items-start gap-1.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium truncate">
                        {conv.subject || "No subject"}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(conv.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <UnreadBadge count={unreadCounts[conv.id] ?? 0} />
                      <StatusBadge status={conv.status} />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Right panel — message history + input */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedConversation ? (
          <>
            <div className="px-3 py-2 border-b border-border flex items-center gap-2">
              <MessageCircle className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <p className="text-[11px] font-medium truncate flex-1">
                {selectedConversation.subject || "No subject"}
              </p>
              <ConnectionDot status={wsStatus} />
              <StatusBadge status={selectedConversation.status} />
            </div>

            <ScrollArea className="flex-1 px-3 py-2">
              {loadingMsgs ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={cn(
                        "h-7 w-40 rounded-lg bg-muted/50 animate-pulse",
                        i % 2 === 0 && "ml-auto",
                      )}
                    />
                  ))}
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-24 text-[11px] text-muted-foreground opacity-50">
                  No messages yet
                </div>
              ) : (
                <div className="space-y-1.5">
                  {messages.map((msg) => {
                    const isVisitor =
                      msg.senderId === visitorUserId || (msg.pending && msg.clientId !== undefined);
                    const canModify =
                      isVisitor &&
                      !msg.pending &&
                      Date.now() - new Date(msg.createdAt).getTime() < 15 * 60 * 1000;
                    const isEditing = editingState?.id === msg.id;

                    return (
                      <div
                        key={msg.clientId ?? msg.id}
                        className={cn("flex group", isVisitor ? "justify-end" : "justify-start")}
                      >
                        {isEditing ? (
                          <div className="flex items-center gap-1 max-w-[80%]">
                            <Input
                              autoFocus
                              value={editingState.content}
                              onChange={(e) => setEditingContent(e.target.value)}
                              onKeyDown={(e) => handleEditKeyDown(e, msg)}
                              className="h-7 text-xs"
                              disabled={editingState.saving}
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 flex-shrink-0"
                              onClick={() => void handleSaveEdit(msg)}
                              disabled={editingState.saving}
                            >
                              <Check className="h-3 w-3" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 flex-shrink-0"
                              onClick={handleCancelEdit}
                              disabled={editingState.saving}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-end gap-1">
                            {canModify && (
                              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-5 w-5"
                                  onClick={() => handleStartEdit(msg)}
                                  title="Edit message"
                                >
                                  <Pencil className="h-2.5 w-2.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-5 w-5 text-destructive hover:text-destructive"
                                  onClick={() => void handleDelete(msg)}
                                  title="Delete message"
                                >
                                  <Trash2 className="h-2.5 w-2.5" />
                                </Button>
                              </div>
                            )}
                            <div
                              className={cn(
                                "max-w-[72%] rounded-lg px-2.5 py-1.5 text-[11px] leading-relaxed transition-opacity",
                                isVisitor
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted text-foreground",
                                msg.pending && "opacity-60",
                              )}
                            >
                              {msg.content}
                              {msg.editedAt && (
                                <span className="ml-1 text-[9px] opacity-60">(edited)</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            {selectedConversation.status === "closed" ? (
              <div className="p-3 border-t border-border bg-muted/30 text-center">
                <p className="text-xs text-muted-foreground">This conversation has been resolved</p>
              </div>
            ) : (
              <div className="border-t border-border p-2 space-y-1">
                {operatorTypingName && (
                  <p className="text-[10px] text-muted-foreground px-1 italic">
                    {operatorTypingName} is typing…
                  </p>
                )}
                {sendError && (
                  <p className="text-[10px] text-destructive px-1">{sendError}</p>
                )}
                <form onSubmit={handleSend} className="flex gap-1.5">
                  <Input
                    value={inputValue}
                    onChange={handleInputChange}
                    onKeyDown={handleInputKeyDown}
                    placeholder="Type a message…"
                    className="flex-1 h-7 text-xs"
                    disabled={sending}
                  />
                  <Button
                    type="submit"
                    size="icon"
                    className="h-7 w-7"
                    disabled={sending || !inputValue.trim()}
                  >
                    <Send className="h-3 w-3" />
                  </Button>
                </form>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <MessageCircle className="h-8 w-8 opacity-20" />
            <p className="text-xs opacity-50">Select a conversation or start a new one</p>
          </div>
        )}
      </div>
    </div>
  );
}
