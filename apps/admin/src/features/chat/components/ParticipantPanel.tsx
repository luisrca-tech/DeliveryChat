import { Users } from "lucide-react";
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
  const participants = data?.conversation?.participants ?? [];

  return (
    <div className="w-72 border-l border-border bg-card/50 flex flex-col shrink-0">
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

function ParticipantRow({ participant }: { participant: ConversationParticipant }) {
  const roleClass = roleColors[participant.role] ?? "bg-gray-100 text-gray-600";

  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-accent/50">
      <span className="text-sm truncate">{participant.userId}</span>
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${roleClass}`}>
        {participant.role}
      </span>
    </div>
  );
}
