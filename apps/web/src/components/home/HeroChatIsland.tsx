import { useState, useEffect, useRef } from "react";
import { Button } from "@repo/ui/components/ui/button";
import { MessageCircle, Send, X, Loader2 } from "lucide-react";

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

const DEMO_SUBJECT = "Live Demo – Landing Page";
const POLL_INTERVAL_MS = 5000;

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
    const body = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

type ConversationResponse = {
  id: string;
  status: string;
  participants: Array<{ userId: string; role: string; joinedAt: string }>;
};

export function HeroChatIsland({ logoSrc }: { logoSrc: string }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [conversation, setConversation] = useState<DemoConversation | null>(
    null,
  );
  const [messages, setMessages] = useState<DemoMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (phase !== "chatting" || !conversation) return;
    const id = setInterval(async () => {
      try {
        const data = await demoFetch<{ messages: DemoMessage[] }>(
          `conversations/${conversation.id}/messages?limit=50&offset=0`,
        );
        setMessages(data.messages);
      } catch {
        // silent poll failure — Phase 3 WebSocket will replace this
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [phase, conversation]);

  async function openChat() {
    setPhase("opening");
    setError(null);
    try {
      const listData = await demoFetch<{
        conversations: ConversationResponse[];
      }>("conversations?limit=1");

      let conv: ConversationResponse;
      if (listData.conversations.length > 0) {
        conv = listData.conversations[0];
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

      const msgData = await demoFetch<{ messages: DemoMessage[] }>(
        `conversations/${conv.id}/messages?limit=50&offset=0`,
      );
      setMessages(msgData.messages);
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
    try {
      const data = await demoFetch<{ message: DemoMessage }>(
        `conversations/${conversation.id}/messages`,
        { method: "POST", body: JSON.stringify({ content }) },
      );
      setMessages((prev) => [...prev, data.message]);
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
              className="bg-gradient-hero hover:shadow-glow transition-all duration-300"
            >
              <MessageCircle className="mr-2 h-4 w-4" />
              Start Chat
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
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">Connecting...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl overflow-hidden shadow-glow border border-border/50 bg-card backdrop-blur-sm">
      <div className="flex flex-col h-[28rem]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-sm font-medium">Live Chat</span>
          </div>
          <button
            onClick={() => setPhase("idle")}
            className="text-muted-foreground hover:text-foreground transition-colors rounded-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            aria-label="Close chat"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
          {messages.length === 0 && (
            <p className="text-center text-xs text-muted-foreground pt-4">
              Say hello! Our team will respond shortly.
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
            <p className="text-center text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="flex items-end gap-2 px-4 py-3 border-t border-border shrink-0">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            rows={1}
            className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            disabled={sending}
            aria-label="Chat message"
          />
          <Button
            onClick={() => void sendMessage()}
            disabled={!input.trim() || sending}
            size="sm"
            className="bg-primary hover:bg-primary/90 shrink-0"
            aria-label="Send message"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
