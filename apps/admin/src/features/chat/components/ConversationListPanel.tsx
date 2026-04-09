import { useState, useMemo } from "react";
import { ScrollArea } from "@repo/ui/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { toast } from "sonner";
import { ConfirmDialog } from "@repo/ui/components/ui/confirm-dialog";
import { useConversationsQuery } from "../hooks/useConversationsQuery";
import { useDeleteConversationMutation } from "../hooks/useConversationMutations";
import { useApplicationsQuery } from "@/features/applications/hooks/useApplicationsQuery";
import { useMembersQuery } from "@/features/members/hooks/useMembersQuery";
import { filterOptions } from "../constants/conversation-filters";
import { ConversationListItem } from "./ConversationListItem";

type Props = {
  selectedId: string | null;
  onSelect: (id: string) => void;
  currentUserRole: string;
  filter: string;
  appId: string | undefined;
  onFiltersChange: (filter: string, appId: string | undefined) => void;
};

const ALL_APPS = "__all__";

const emptyMessages: Record<string, string> = {
  queue: "No pending conversations",
  mine: "No active conversations assigned to you",
  all: "No active conversations",
  closed: "No closed conversations",
};

export function ConversationListPanel({
  selectedId,
  onSelect,
  currentUserRole,
  filter: activeFilter,
  appId: appIdFromUrl,
  onFiltersChange,
}: Props) {
  const isAdmin = currentUserRole === "admin" || currentUserRole === "super_admin";
  const selectedAppId = appIdFromUrl ?? ALL_APPS;

  const handleFilterChange = (value: string) => {
    onFiltersChange(value, selectedAppId === ALL_APPS ? undefined : selectedAppId);
  };

  const handleAppChange = (value: string) => {
    onFiltersChange(activeFilter, value === ALL_APPS ? undefined : value);
  };

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

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const deleteMutation = useDeleteConversationMutation();

  const handleConfirmDelete = () => {
    if (!deleteTargetId) return;
    deleteMutation.mutate(deleteTargetId, {
      onSuccess: () => {
        toast.success("Conversation deleted");
        setDeleteTargetId(null);
      },
      onError: () => toast.error("Failed to delete conversation"),
    });
  };

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

        <div className="grid grid-cols-2 gap-2">
          <Select value={activeFilter} onValueChange={handleFilterChange}>
            <SelectTrigger className="w-full cursor-pointer [&>span]:flex-1 [&>span]:text-left">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {visibleOptions.map((opt) => (
                <SelectItem className="cursor-pointer" key={opt.id} value={opt.id}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {applications.length > 0 && (
            <Select value={selectedAppId} onValueChange={handleAppChange}>
              <SelectTrigger className="w-full cursor-pointer [&>span]:flex-1 [&>span]:text-left">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem className="cursor-pointer" value={ALL_APPS}>All</SelectItem>
                {applications.map((app) => (
                  <SelectItem className="cursor-pointer" key={app.id} value={app.id}>
                    {app.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
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
            canDelete={isAdmin}
            onDelete={setDeleteTargetId}
          />
        ))}
      </ScrollArea>

      <ConfirmDialog
        open={!!deleteTargetId}
        onOpenChange={(open) => !open && setDeleteTargetId(null)}
        title="Delete Conversation"
        description="Are you sure you want to delete this conversation? This action cannot be undone."
        onConfirm={handleConfirmDelete}
        confirmLabel="Delete"
        variant="destructive"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
