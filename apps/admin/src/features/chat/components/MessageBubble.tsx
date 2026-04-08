import type { Message } from "../types/chat.types";

type Props = {
  message: Message;
  isSelf: boolean;
};

const roleColors: Record<string, string> = {
  admin: "text-purple-600",
  super_admin: "text-red-600",
  operator: "text-green-600",
  visitor: "text-blue-600",
};

const roleLabels: Record<string, string> = {
  admin: "Admin",
  super_admin: "Super Admin",
  operator: "Operator",
  visitor: "Visitor",
};

export function MessageBubble({ message, isSelf }: Props) {
  if (message.type === "system") {
    return (
      <div className="text-center">
        <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
          {message.content}
        </span>
      </div>
    );
  }

  const roleLabel = message.senderRole ? roleLabels[message.senderRole] : null;
  const roleColor = message.senderRole ? roleColors[message.senderRole] : "";

  return (
    <div className={`flex flex-col ${isSelf ? "items-end" : "items-start"}`}>
      {!isSelf && (
        <div className="flex items-center gap-1.5 mb-0.5 px-1">
          {message.senderName && (
            <span className="text-[11px] font-medium text-muted-foreground">
              {message.senderName}
            </span>
          )}
          {roleLabel && (
            <span className={`text-[10px] font-medium ${roleColor}`}>
              {roleLabel}
            </span>
          )}
        </div>
      )}
      <div
        className={`max-w-[70%] px-3 py-2 rounded-xl text-sm leading-relaxed ${
          isSelf
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-muted rounded-bl-sm"
        }`}
      >
        {message.content}
      </div>
      <span className="text-[10px] text-muted-foreground mt-0.5 px-1">
        {formatTime(message.createdAt)}
      </span>
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}
