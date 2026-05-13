import type { RefObject } from "react";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { ScrollArea } from "@repo/ui/components/ui/scroll-area";
import { MessageCircle, Plus, X, Send, Wifi, WifiOff, Pencil, Trash2, Check } from "lucide-react";
import { cn } from "@repo/ui/lib/utils";
import type { Conversation } from "../chat-client";
import type { OptimisticMessage } from "../lib/wsMessageReducer";

type WsStatus = "connecting" | "connected" | "disconnected";

interface EditingState {
  id: string;
  content: string;
  saving: boolean;
}

interface NewFormState {
  visible: boolean;
  subject: string;
  creating: boolean;
}

// --- Small display components ---

export function StatusBadge({ status }: { status: string }) {
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

export function ConnectionDot({ status }: { status: WsStatus }) {
  if (status === "connected") return <Wifi className="h-3 w-3 text-green-500 flex-shrink-0" />;
  if (status === "connecting")
    return <Wifi className="h-3 w-3 text-yellow-500 flex-shrink-0 animate-pulse" />;
  return <WifiOff className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />;
}

export function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex items-center justify-center h-4 min-w-[1rem] px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-semibold flex-shrink-0">
      {count > 99 ? "99+" : count}
    </span>
  );
}

// --- Conversation list panel ---

export interface ConversationListPanelProps {
  conversations: Conversation[];
  selectedId: string | null;
  loadingConvs: boolean;
  unreadCounts: Record<string, number>;
  newForm: NewFormState;
  onSelect: (id: string) => void;
  showNewForm: () => void;
  hideNewForm: () => void;
  setNewSubject: (subject: string) => void;
  handleCreateConversation: (e: React.FormEvent) => Promise<void>;
}

export function ConversationListPanel({
  conversations,
  selectedId,
  loadingConvs,
  unreadCounts,
  newForm,
  onSelect,
  showNewForm,
  hideNewForm,
  setNewSubject,
  handleCreateConversation,
}: ConversationListPanelProps) {
  return (
    <div className="w-[240px] flex-shrink-0 border-r border-border flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-semibold text-foreground">Conversations</span>
        {!newForm.visible && (
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={showNewForm}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {newForm.visible && (
        <form onSubmit={handleCreateConversation} className="p-2 border-b border-border space-y-1.5">
          <Input
            autoFocus
            placeholder="Subject (optional)…"
            value={newForm.subject}
            onChange={(e) => setNewSubject(e.target.value)}
            className="h-7 text-xs"
          />
          <div className="flex gap-1">
            <Button type="submit" size="sm" className="flex-1 h-6 text-xs" disabled={newForm.creating}>
              {newForm.creating ? "Creating…" : "Start chat"}
            </Button>
            <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={hideNewForm}>
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
                onClick={() => onSelect(conv.id)}
                className={cn(
                  "w-full text-left rounded-md px-2 py-1.5 hover:bg-accent/60 transition-colors",
                  selectedId === conv.id && "bg-accent",
                )}
              >
                <div className="flex items-start gap-1.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium truncate">{conv.subject || "No subject"}</p>
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
  );
}

// --- Message thread panel ---

export interface MessageThreadPanelProps {
  messages: OptimisticMessage[];
  conversation: Conversation | undefined;
  wsStatus: WsStatus;
  loadingMsgs: boolean;
  visitorUserId: string | null;
  operatorTypingName: string | null;
  sendError: string | null;
  inputValue: string;
  sending: boolean;
  editingState: EditingState | null;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleInputKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  handleSend: (e: React.FormEvent) => Promise<void>;
  handleStartEdit: (msg: OptimisticMessage) => void;
  handleCancelEdit: () => void;
  setEditingContent: (content: string) => void;
  handleSaveEdit: (msg: OptimisticMessage) => Promise<void>;
  handleDelete: (msg: OptimisticMessage) => Promise<void>;
  handleEditKeyDown: (e: React.KeyboardEvent<HTMLInputElement>, msg: OptimisticMessage) => void;
}

export function MessageThreadPanel({
  messages,
  conversation,
  wsStatus,
  loadingMsgs,
  visitorUserId,
  operatorTypingName,
  sendError,
  inputValue,
  sending,
  editingState,
  messagesEndRef,
  handleInputChange,
  handleInputKeyDown,
  handleSend,
  handleStartEdit,
  handleCancelEdit,
  setEditingContent,
  handleSaveEdit,
  handleDelete,
  handleEditKeyDown,
}: MessageThreadPanelProps) {
  if (!conversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <MessageCircle className="h-8 w-8 opacity-20" />
        <p className="text-xs opacity-50">Select a conversation or start a new one</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="px-3 py-2 border-b border-border flex items-center gap-2">
        <MessageCircle className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <p className="text-[11px] font-medium truncate flex-1">{conversation.subject || "No subject"}</p>
        <ConnectionDot status={wsStatus} />
        <StatusBadge status={conversation.status} />
      </div>

      <ScrollArea className="flex-1 px-3 py-2">
        {loadingMsgs ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className={cn("h-7 w-40 rounded-lg bg-muted/50 animate-pulse", i % 2 === 0 && "ml-auto")}
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
                          isVisitor ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                          msg.pending && "opacity-60",
                        )}
                      >
                        {msg.content}
                        {msg.editedAt && <span className="ml-1 text-[9px] opacity-60">(edited)</span>}
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

      {conversation.status === "closed" ? (
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
          {sendError && <p className="text-[10px] text-destructive px-1">{sendError}</p>}
          <form onSubmit={handleSend} className="flex gap-1.5">
            <Input
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleInputKeyDown}
              placeholder="Type a message…"
              className="flex-1 h-7 text-xs"
              disabled={sending}
            />
            <Button type="submit" size="icon" className="h-7 w-7" disabled={sending || !inputValue.trim()}>
              <Send className="h-3 w-3" />
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
