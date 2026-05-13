import { useState, useEffect, useRef } from "react";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { ScrollArea } from "@repo/ui/components/ui/scroll-area";
import { createChatClient } from "../chat-client";
import type { Conversation, Message } from "../chat-client";
import { MessageCircle, Plus, X } from "lucide-react";
import { cn } from "@repo/ui/lib/utils";

interface ChatDemoIslandProps {
  apiUrl: string;
  apiKey: string;
  appId: string;
}

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

export function ChatDemoIsland({ apiUrl, apiKey, appId }: ChatDemoIslandProps) {
  const clientRef = useRef(createChatClient({ apiUrl, apiKey, appId }));

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [creating, setCreating] = useState(false);
  const [visitorUserId, setVisitorUserId] = useState<string | null>(null);

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

  function handleSelectConversation(id: string) {
    setSelectedId(id);
    setMessages([]);
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
      // error handling added in Phase 4
    } finally {
      setCreating(false);
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

      {/* Right panel — message history */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedConversation ? (
          <>
            <div className="px-3 py-2 border-b border-border flex items-center gap-2">
              <MessageCircle className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <p className="text-[11px] font-medium truncate flex-1">
                {selectedConversation.subject || "No subject"}
              </p>
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
                    const isVisitor = msg.senderId === visitorUserId;
                    return (
                      <div
                        key={msg.id}
                        className={cn("flex", isVisitor ? "justify-end" : "justify-start")}
                      >
                        <div
                          className={cn(
                            "max-w-[72%] rounded-lg px-2.5 py-1.5 text-[11px] leading-relaxed",
                            isVisitor
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-foreground",
                          )}
                        >
                          {msg.content}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
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
