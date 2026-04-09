import { useState, useMemo } from "react";
import { ScrollArea } from "@repo/ui/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { useConversationsQuery } from "../hooks/useConversationsQuery";
import { useApplicationsQuery } from "@/features/applications/hooks/useApplicationsQuery";
import { useMembersQuery } from "@/features/members/hooks/useMembersQuery";
import { filterOptions } from "../constants/conversation-filters";
import { ConversationListItem } from "./ConversationListItem";

type Props = {
  selectedId: string | null;
  onSelect: (id: string) => void;
  currentUserRole: string;
};

const ALL_APPS = "__all__";

const emptyMessages: Record<string, string> = {
  queue: "No pending conversations",
  mine: "No active conversations assigned to you",
  "all-active": "No active conversations",
  closed: "No closed conversations",
};

export function ConversationListPanel({ selectedId, onSelect, currentUserRole }: Props) {
  const [activeFilter, setActiveFilter] = useState("queue");
  const [selectedAppId, setSelectedAppId] = useState(ALL_APPS);

  const isAdmin = currentUserRole === "admin" || currentUserRole === "super_admin";
  const visibleOptions = filterOptions.filter((opt) => !opt.adminOnly || isAdmin);
  const currentOption = visibleOptions.find((opt) => opt.id === activeFilter) ?? visibleOptions[0]!;

  const { data: appsData } = useApplicationsQuery(
    100,
    0,
    isAdmin ? undefined : { hasMyConversations: true },
  );
  const { data: membersData } = useMembersQuery();

  const appNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const app of appsData?.applications ?? []) {
      map.set(app.id, app.name);
    }
    return map;
  }, [appsData]);

  const memberNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of membersData?.users ?? []) {
      map.set(member.id, member.name);
    }
    return map;
  }, [membersData]);

  const applications = appsData?.applications ?? [];
  const showAllApps = selectedAppId === ALL_APPS;

  const { data, isLoading } = useConversationsQuery({
    limit: 50,
    offset: 0,
    ...currentOption.filters,
    ...(showAllApps ? {} : { applicationId: selectedAppId }),
  });

  const conversations = data?.conversations ?? [];

  return (
    <div className="w-80 border-r border-border flex flex-col bg-card/50 shrink-0">
      <div className="p-4 border-b border-border space-y-2">
        <h2 className="text-lg font-semibold">Conversations</h2>

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

        {applications.length > 0 && (
          <Select value={selectedAppId} onValueChange={setSelectedAppId}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_APPS}>All Applications</SelectItem>
              {applications.map((app) => (
                <SelectItem key={app.id} value={app.id}>
                  {app.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
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
            appName={showAllApps ? appNameMap.get(conv.applicationId ?? "") : undefined}
            assignedToName={conv.assignedTo ? memberNameMap.get(conv.assignedTo) : undefined}
          />
        ))}
      </ScrollArea>
    </div>
  );
}
