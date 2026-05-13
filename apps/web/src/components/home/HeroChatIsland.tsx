import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@repo/ui/components/ui/button";
import { MessageCircle, Send, X, Loader2, WifiOff } from "lucide-react";
import type { WSServerEvent } from "@repo/types";

type DemoMessage = {
  id: string;
  senderId: string;
  content: string;
  createdAt: string;
};

type DemoConversation = {
  id: string;
  status: string;
  visitorUserId: string;
};

type Phase = "idle" | "opening" | "chatting" | "error";
type ConvStatus = "pending" | "active" | "closed";
type WsStatus = "idle" | "connecting" | "connected" | "disconnected";

const DEMO_SUBJECT = "Live Demo – Landing Page";

async function demoFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/demo/${path}`, {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...init?.headers,
    },
    ...init,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

type ConversationResponse = {
  id: string;
  status: string;
  participants: Array<{ userId: string; role: string; joinedAt: string }>;
};

export function HeroChatIsland({
  logoSrc,
  wsApiUrl,
}: {
  logoSrc: string;
  wsApiUrl?: string;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [conversation, setConversation] = useState<DemoConversation | null>(
    null,
  );
  const [messages, setMessages] = useState<DemoMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wsStatus, setWsStatus] = useState<WsStatus>("idle");
  const [convStatus, setConvStatus] = useState<ConvStatus>("pending");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastMessageIdRef = useRef<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (phase === "chatting") {
      textareaRef.current?.focus();
    }
  }, [phase]);

  const appendMessage = useCallback((msg: DemoMessage) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
    lastMessageIdRef.current = msg.id;
  }, []);

  useEffect(() => {
    if (phase !== "chatting" || !conversation || !wsApiUrl) return;

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const convId = conversation.id;

    async function connect() {
      if (cancelled) return;
      setWsStatus("connecting");
      try {
        const data = await demoFetch<{ token: string }>("ws-token", {
          method: "POST",
        });
        if (cancelled) return;

        const url = `${wsApiUrl}/v1/ws?token=${encodeURIComponent(data.token)}`;
        ws = new WebSocket(url);

        ws.onopen = () => {
          setWsStatus("connected");
          ws?.send(
            JSON.stringify({
              type: "room:join",
              payload: {
                conversationId: convId,
                ...(lastMessageIdRef.current
                  ? { lastMessageId: lastMessageIdRef.current }
                  : {}),
              },
            }),
          );
        };

        ws.onmessage = (event) => {
          try {
            const serverEvent = JSON.parse(event.data as string) as WSServerEvent;
            if (serverEvent.type === "message:new") {
              const p = serverEvent.payload;
              appendMessage({
                id: p.id,
                senderId: p.senderId,
                content: p.content,
                createdAt: p.createdAt,
              });
            } else if (serverEvent.type === "messages:sync") {
              for (const p of serverEvent.payload.messages) {
                appendMessage({
                  id: p.id,
                  senderId: p.senderId,
                  content: p.content,
                  createdAt: p.createdAt,
                });
              }
            } else if (serverEvent.type === "conversation:accepted") {
              setConvStatus("active");
            } else if (serverEvent.type === "conversation:resolved") {
              setConvStatus("closed");
            }
          } catch {
            /* ignore malformed frames */
          }
        };

        ws.onclose = () => {
          ws = null;
          if (!cancelled) {
            setWsStatus("disconnected");
            reconnectTimer = setTimeout(() => void connect(), 2000);
          }
        };

        ws.onerror = () => {
          ws?.close();
        };
      } catch {
        if (!cancelled) {
          setWsStatus("disconnected");
          reconnectTimer = setTimeout(() => void connect(), 3000);
        }
      }
    }

    void connect();

    return () => {
      cancelled = true;
      setWsStatus("idle");
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [phase, conversation, wsApiUrl, appendMessage]);

  async function openChat() {
    setPhase("opening");
    setError(null);
    try {
      const listData = await demoFetch<{
        conversations: ConversationResponse[];
      }>("conversations?limit=1");

      let conv: ConversationResponse;
      if (listData.conversations.length > 0) {
        const existing = listData.conversations[0];
        const detail = await demoFetch<{ conversation: ConversationResponse }>(
          `conversations/${existing.id}`,
        );
        conv = detail.conversation;
      } else {
        const created = await demoFetch<{ conversation: ConversationResponse }>(
          "conversations",
          {
            method: "POST",
            body: JSON.stringify({ subject: DEMO_SUBJECT }),
          },
        );
        conv = created.conversation;
      }

      const visitorPart = conv.participants.find((p) => p.role === "visitor");
      setConversation({
        id: conv.id,
        status: conv.status,
        visitorUserId: visitorPart?.userId ?? "",
      });
      setConvStatus(
        conv.status === "active"
          ? "active"
          : conv.status === "closed"
            ? "closed"
            : "pending",
      );

      const msgData = await demoFetch<{ messages: DemoMessage[] }>(
        `conversations/${conv.id}/messages?limit=50&offset=0`,
      );
      setMessages(msgData.messages);
      if (msgData.messages.length > 0) {
        lastMessageIdRef.current =
          msgData.messages[msgData.messages.length - 1].id;
      }
      setPhase("chatting");
    } catch (e) {
      setError((e as Error).message || "Could not connect. Try again later.");
      setPhase("error");
    }
  }

  async function sendMessage() {
    if (!input.trim() || !conversation || sending) return;
    const content = input.trim();
    setInput("");
    setSending(true);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    try {
      const data = await demoFetch<{ message: DemoMessage }>(
        `conversations/${conversation.id}/messages`,
        { method: "POST", body: JSON.stringify({ content }) },
      );
      appendMessage(data.message);
    } catch (e) {
      setError((e as Error).message || "Failed to send. Try again.");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  }

  if (phase === "idle" || phase === "error") {
    return (
      <div className="relative rounded-2xl overflow-hidden shadow-glow border border-border/50 bg-gradient-card backdrop-blur-sm">
        <div className="aspect-video bg-linear-to-br from-primary/20 to-primary-glow/20 flex items-center justify-center">
          <div className="text-center space-y-4 px-4">
            <img
              src={logoSrc}
              alt=""
              width="300"
              height="164"
              className="w-auto max-w-xs h-28 object-contain opacity-30 mx-auto"
            />
            <p className="text-sm text-muted-foreground">
              Try a live conversation with our team
            </p>
            {error && (
              <p className="text-xs text-destructive" role="alert">
                {error}
              </p>
            )}
            <Button
              onClick={() => void openChat()}
              className="bg-gradient-hero hover:shadow-glow transition-all duration-300 focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <MessageCircle className="mr-2 h-4 w-4" aria-hidden="true" />
              {phase === "error" ? "Try Again" : "Start Chat"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "opening") {
    return (
      <div className="relative rounded-2xl overflow-hidden shadow-glow border border-border/50 bg-gradient-card backdrop-blur-sm">
        <div className="aspect-video bg-linear-to-br from-primary/20 to-primary-glow/20 flex items-center justify-center">
          <div className="text-center space-y-3">
            <Loader2
              className="h-8 w-8 animate-spin text-primary mx-auto"
              aria-hidden="true"
            />
            <p className="text-sm text-muted-foreground" role="status">
              Connecting…
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative rounded-2xl overflow-hidden shadow-glow border border-border/50 bg-card backdrop-blur-sm"
      role="dialog"
      aria-label="Live chat demo"
    >
      <div className="flex flex-col h-[20rem] sm:h-[28rem]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0 bg-card">
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${wsStatus === "connected" ? "bg-primary animate-pulse" : "bg-muted-foreground"}`}
              aria-hidden="true"
            />
            <span className="text-sm font-semibold">Live Chat</span>
            {wsStatus === "disconnected" && (
              <span
                className="flex items-center gap-1 text-xs text-muted-foreground"
                role="status"
                aria-live="polite"
              >
                <WifiOff className="h-3 w-3" aria-hidden="true" />
                Reconnecting…
              </span>
            )}
            {wsStatus === "connecting" && (
              <span
                className="text-xs text-muted-foreground"
                role="status"
                aria-live="polite"
              >
                Connecting…
              </span>
            )}
          </div>
          <button
            onClick={() => setPhase("idle")}
            className="text-muted-foreground hover:text-foreground transition-colors rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            aria-label="Close chat"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Messages */}
        <div
          role="log"
          aria-live="polite"
          aria-label="Chat messages"
          className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0"
        >
          {messages.length === 0 && (
            <p className="text-center text-xs text-muted-foreground pt-4">
              Say hello! Our team will respond shortly.
            </p>
          )}
          {convStatus === "pending" && (
            <div
              className="flex items-center justify-center gap-2 py-2"
              role="status"
              aria-live="polite"
            >
              <Loader2
                className="h-3 w-3 animate-spin text-muted-foreground"
                aria-hidden="true"
              />
              <span className="text-xs text-muted-foreground">
                Waiting for support…
              </span>
            </div>
          )}
          {convStatus === "active" && messages.length === 0 && (
            <p
              className="text-center text-xs text-primary pt-2"
              role="status"
              aria-live="polite"
            >
              Connected with support
            </p>
          )}
          {messages.map((msg) => {
            const isMe = msg.senderId === conversation?.visitorUserId;
            return (
              <div
                key={msg.id}
                className={`flex ${isMe ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] rounded-xl px-3 py-2 text-sm break-words ${
                    isMe
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            );
          })}
          {error && (
            <p
              className="text-center text-xs text-destructive"
              role="alert"
              aria-live="assertive"
            >
              {error}
            </p>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="flex items-end gap-2 px-4 py-3 border-t border-border shrink-0">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            rows={1}
            className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 overflow-hidden"
            disabled={sending}
            aria-label="Chat message"
          />
          <Button
            onClick={() => void sendMessage()}
            disabled={!input.trim() || sending}
            size="sm"
            className="bg-primary hover:bg-primary/90 shrink-0 focus-visible:ring-2 focus-visible:ring-primary/50"
            aria-label="Send message"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
