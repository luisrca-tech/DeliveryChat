import { useState } from "react";
import { Inbox, MessageSquare, Archive } from "lucide-react";
import { ScrollArea } from "@repo/ui/components/ui/scroll-area";
import { useConversationsQuery } from "../hooks/useConversationsQuery";
import { ConversationListItem } from "./ConversationListItem";
import type { ConversationStatus } from "@repo/types";

type Tab = "queue" | "mine" | "closed";

type Props = {
  selectedId: string | null;
  onSelect: (id: string) => void;
  currentUserId: string;
};

const tabs: { id: Tab; label: string; icon: typeof Inbox; status: ConversationStatus }[] = [
  { id: "queue", label: "Queue", icon: Inbox, status: "pending" },
  { id: "mine", label: "My Chats", icon: MessageSquare, status: "active" },
  { id: "closed", label: "Closed", icon: Archive, status: "closed" },
];

export function ConversationListPanel({ selectedId, onSelect, currentUserId }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("queue");
  const currentTab = tabs.find((t) => t.id === activeTab)!;

  const { data, isLoading } = useConversationsQuery({
    limit: 50,
    offset: 0,
    status: currentTab.status,
  });

  const conversations = data?.conversations ?? [];

  return (
    <div className="w-80 border-r border-border flex flex-col bg-card/50 shrink-0">
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-semibold mb-3">Conversations</h2>
        <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeTab === tab.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <ScrollArea className="flex-1">
        {isLoading && (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Loading...
          </div>
        )}

        {conversations.length === 0 && !isLoading && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {activeTab === "queue"
              ? "No pending conversations"
              : activeTab === "mine"
                ? "No active conversations assigned to you"
                : "No closed conversations"}
          </div>
        )}

        {conversations.map((conv) => (
          <ConversationListItem
            key={conv.id}
            conversation={conv}
            isSelected={conv.id === selectedId}
            onClick={() => onSelect(conv.id)}
          />
        ))}
      </ScrollArea>
    </div>
  );
}
