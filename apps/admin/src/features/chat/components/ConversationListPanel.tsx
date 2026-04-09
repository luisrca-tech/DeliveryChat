import { useState } from "react";
import { ScrollArea } from "@repo/ui/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { useConversationsQuery } from "../hooks/useConversationsQuery";
import { filterOptions } from "../constants/conversation-filters";
import { ConversationListItem } from "./ConversationListItem";

type Props = {
  selectedId: string | null;
  onSelect: (id: string) => void;
  currentUserRole: string;
};

const emptyMessages: Record<string, string> = {
  queue: "No pending conversations",
  mine: "No active conversations assigned to you",
  "all-active": "No active conversations",
  closed: "No closed conversations",
};

export function ConversationListPanel({ selectedId, onSelect, currentUserRole }: Props) {
  const [activeFilter, setActiveFilter] = useState("queue");

  const isAdmin = currentUserRole === "admin" || currentUserRole === "super_admin";
  const visibleOptions = filterOptions.filter((opt) => !opt.adminOnly || isAdmin);
  const currentOption = visibleOptions.find((opt) => opt.id === activeFilter) ?? visibleOptions[0]!;

  const { data, isLoading } = useConversationsQuery({
    limit: 50,
    offset: 0,
    ...currentOption.filters,
  });

  const conversations = data?.conversations ?? [];

  return (
    <div className="w-80 border-r border-border flex flex-col bg-card/50 shrink-0">
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-semibold mb-3">Conversations</h2>
        <Select value={activeFilter} onValueChange={setActiveFilter}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {visibleOptions.map((opt) => (
              <SelectItem key={opt.id} value={opt.id}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ScrollArea className="flex-1">
        {isLoading && (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Loading...
          </div>
        )}

        {conversations.length === 0 && !isLoading && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {emptyMessages[activeFilter] ?? "No conversations"}
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
