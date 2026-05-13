import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { ScrollArea } from "@repo/ui/components/ui/scroll-area";
import { createChatClient } from "../chat-client";
import type { Conversation, Message } from "../chat-client";
import { MessageCircle, Plus, X, Send, Wifi, WifiOff } from "lucide-react";
import { cn } from "@repo/ui/lib/utils";

interface ChatDemoIslandProps {
  apiUrl: string;
  apiKey: string;
  appId: string;
}

type WsStatus = "connecting" | "connected" | "disconnected";

type OptimisticMessage = Message & {
  clientId?: string;
  pending?: boolean;
  sendError?: boolean;
};

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

export function ChatDemoIsland({ apiUrl, apiKey, appId }: ChatDemoIslandProps) {
  const clientRef = useRef(createChatClient({ apiUrl, apiKey, appId }));
  const wsRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const selectedIdRef = useRef<string | null>(null);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<OptimisticMessage[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [creating, setCreating] = useState(false);
  const [visitorUserId, setVisitorUserId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [wsStatus, setWsStatus] = useState<WsStatus>("disconnected");

  useEffect(() => {
    const client = clientRef.current;
    setLoadingConvs(true);
    client
      .listConversations()
      .then(({ conversations: convs }) => {
        setConversations(convs);
        for (const conv of convs) {
          const visitor = conv.participants.find((p) => p.role === "visitor");
          if (visitor) {
            setVisitorUserId(visitor.userId);
            break;
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingConvs(false));
  }, []);

  const handleWsMessage = useCallback((event: MessageEvent) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(event.data as string);
    } catch {
      return;
    }

    const { type, payload } = parsed as { type: string; payload: Record<string, unknown> };

    switch (type) {
      case "message:ack": {
        const { clientMessageId, serverMessageId, createdAt } = payload as {
          clientMessageId: string;
          serverMessageId: string;
          createdAt: string;
        };
        setMessages((prev) =>
          prev.map((m) =>
            m.clientId === clientMessageId
              ? { ...m, id: serverMessageId, createdAt, pending: false, clientId: undefined }
              : m,
          ),
        );
        break;
      }
      case "message:new": {
        const { id, conversationId, senderId, content, createdAt, editedAt } = payload as {
          id: string;
          conversationId: string;
          senderId: string;
          content: string;
          createdAt: string;
          editedAt?: string | null;
        };
        if (conversationId !== selectedIdRef.current) return;
        setMessages((prev) => {
          if (prev.some((m) => m.id === id)) return prev;
          return [
            ...prev,
            { id, conversationId, senderId, content, createdAt, editedAt: editedAt ?? null, pending: false },
          ];
        });
        break;
      }
      case "conversation:accepted": {
        const { conversationId, assignedTo } = payload as {
          conversationId: string;
          assignedTo: string;
        };
        setConversations((prev) =>
          prev.map((c) => (c.id === conversationId ? { ...c, status: "active", assignedTo } : c)),
        );
        break;
      }
      case "conversation:released": {
        const { conversationId } = payload as { conversationId: string };
        setConversations((prev) =>
          prev.map((c) => (c.id === conversationId ? { ...c, status: "pending", assignedTo: null } : c)),
        );
        break;
      }
      case "conversation:resolved": {
        const { conversationId } = payload as { conversationId: string };
        setConversations((prev) =>
          prev.map((c) => (c.id === conversationId ? { ...c, status: "closed" } : c)),
        );
        break;
      }
    }
  }, []);

  useEffect(() => {
    selectedIdRef.current = selectedId;

    wsRef.current?.close();
    if (pingRef.current) clearInterval(pingRef.current);
    setWsStatus("disconnected");
    setSendError(null);

    if (!selectedId) return;

    const client = clientRef.current;
    let cancelled = false;
    let ws: WebSocket | null = null;

    setWsStatus("connecting");

    (async () => {
      try {
        const { token } = await client.getWsToken();
        if (cancelled) return;

        ws = await client.connectWebSocket(token);
        if (cancelled) {
          ws.close();
          return;
        }

        wsRef.current = ws;
        setWsStatus("connected");

        ws.send(JSON.stringify({ type: "room:join", payload: { conversationId: selectedId } }));

        pingRef.current = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, 30_000);

        ws.addEventListener("message", handleWsMessage);

        ws.addEventListener("close", () => {
          if (!cancelled) setWsStatus("disconnected");
        });

        ws.addEventListener("error", () => {
          if (!cancelled) setWsStatus("disconnected");
        });
      } catch {
        if (!cancelled) setWsStatus("disconnected");
      }
    })();

    return () => {
      cancelled = true;
      ws?.close();
      if (pingRef.current) clearInterval(pingRef.current);
    };
  }, [selectedId, handleWsMessage]);

  useEffect(() => {
    if (!selectedId) return;
    const client = clientRef.current;
    setLoadingMsgs(true);
    client
      .getMessages(selectedId)
      .then(({ messages: msgs }) => setMessages(msgs))
      .catch(() => {})
      .finally(() => setLoadingMsgs(false));
  }, [selectedId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSelectConversation(id: string) {
    setSelectedId(id);
    setMessages([]);
    setInputValue("");
    setSendError(null);
  }

  async function handleCreateConversation(e: React.FormEvent) {
    e.preventDefault();
    const subject = newSubject.trim();
    if (!subject) return;
    setCreating(true);
    try {
      const { conversation } = await clientRef.current.createConversation(subject);
      const visitor = conversation.participants.find((p) => p.role === "visitor");
      if (visitor && !visitorUserId) setVisitorUserId(visitor.userId);
      setConversations((prev) => [conversation, ...prev]);
      setSelectedId(conversation.id);
      setMessages([]);
      setShowNewForm(false);
      setNewSubject("");
    } catch {
      // error handling in Phase 4 covered by send flow
    } finally {
      setCreating(false);
    }
  }

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    const content = inputValue.trim();
    if (!content || sending) return;

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setSendError("Not connected. Please wait and try again.");
      return;
    }

    const clientMessageId = crypto.randomUUID();
    const optimistic: OptimisticMessage = {
      id: clientMessageId,
      clientId: clientMessageId,
      conversationId: selectedId!,
      senderId: visitorUserId ?? clientMessageId,
      content,
      createdAt: new Date().toISOString(),
      editedAt: null,
      pending: true,
    };

    setMessages((prev) => [...prev, optimistic]);
    setInputValue("");
    setSendError(null);
    setSending(true);

    try {
      ws.send(
        JSON.stringify({
          type: "message:send",
          payload: { conversationId: selectedId, content, clientMessageId },
        }),
      );
    } catch {
      setMessages((prev) => prev.filter((m) => m.clientId !== clientMessageId));
      setSendError("Failed to send message. Please try again.");
    } finally {
      setSending(false);
    }
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  const selectedConversation = conversations.find((c) => c.id === selectedId);

  return (
    <div className="w-full h-full flex overflow-hidden bg-background text-foreground font-sans">
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
              placeholder="Subject…"
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
              className="h-7 text-xs"
            />
            <div className="flex gap-1">
              <Button
                type="submit"
                size="sm"
                className="flex-1 h-6 text-xs"
                disabled={creating || !newSubject.trim()}
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
                    <StatusBadge status={conv.status} />
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
                    return (
                      <div
                        key={msg.clientId ?? msg.id}
                        className={cn("flex", isVisitor ? "justify-end" : "justify-start")}
                      >
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
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            <div className="border-t border-border p-2 space-y-1">
              {sendError && (
                <p className="text-[10px] text-destructive px-1">{sendError}</p>
              )}
              <form onSubmit={handleSend} className="flex gap-1.5">
                <Input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  placeholder="Type a message…"
                  className="flex-1 h-7 text-xs"
                  disabled={sending || selectedConversation.status === "closed"}
                />
                <Button
                  type="submit"
                  size="icon"
                  className="h-7 w-7"
                  disabled={sending || !inputValue.trim() || selectedConversation.status === "closed"}
                >
                  <Send className="h-3 w-3" />
                </Button>
              </form>
            </div>
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
