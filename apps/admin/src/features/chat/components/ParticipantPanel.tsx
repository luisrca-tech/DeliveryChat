import { useState } from "react";
import { Bot, ChevronDown, Users } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/ui/components/ui/collapsible";
import { useConversationDetailQuery } from "../hooks/useConversationsQuery";
import type { ConversationParticipant } from "../types/chat.types";

type Props = {
  conversationId: string;
};

const roleColors: Record<string, string> = {
  visitor: "bg-blue-100 text-blue-700",
  operator: "bg-green-100 text-green-700",
  admin: "bg-purple-100 text-purple-700",
};

export function ParticipantPanel({ conversationId }: Props) {
  const { data } = useConversationDetailQuery(conversationId);
  const conversation = data?.conversation;
  const participants = conversation?.participants ?? [];
  const [isSummaryOpen, setIsSummaryOpen] = useState(true);

  return (
    <div className="w-72 border-l border-border bg-card/50 flex flex-col shrink-0">
      {conversation?.handoffSummary && (
        <Collapsible
          open={isSummaryOpen}
          onOpenChange={setIsSummaryOpen}
          className="border-b border-border"
        >
          <CollapsibleTrigger className="w-full flex items-center justify-between gap-2 p-4 text-left">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Bot className="h-4 w-4 text-indigo-600" />
              AI handoff summary
            </span>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${
                isSummaryOpen ? "rotate-180" : ""
              }`}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="px-4 pb-4 space-y-2">
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {conversation.handoffSummary}
            </p>
            {conversation.escalationReason && (
              <p className="text-xs text-muted-foreground italic">
                Reason: {conversation.escalationReason}
              </p>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}

      <div className="p-4 border-b border-border flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Participants</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {participants.map((p) => (
          <ParticipantRow key={p.id} participant={p} />
        ))}

        {participants.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            No participants
          </p>
        )}
      </div>
    </div>
  );
}

function ParticipantRow({
  participant,
}: {
  participant: ConversationParticipant;
}) {
  const roleClass = roleColors[participant.role] ?? "bg-gray-100 text-gray-600";

  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-accent/50">
      <span className="text-sm truncate">{participant.userId}</span>
      <span
        className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${roleClass}`}
      >
        {participant.role}
      </span>
    </div>
  );
}
