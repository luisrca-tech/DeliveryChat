import type { InterviewLogEntry } from "../types/aiInterview.types";

export type InterviewChatScrollbackProps = {
  log: InterviewLogEntry[];
  showThinkingIndicator?: boolean;
};

export function InterviewChatScrollback({
  log,
  showThinkingIndicator = false,
}: InterviewChatScrollbackProps) {
  return (
    <div className="flex flex-col gap-3">
      {log.map((entry, index) => (
        <div
          key={index}
          className={
            entry.role === "assistant"
              ? "max-w-[80%] self-start rounded-lg bg-muted px-3 py-2 text-sm"
              : "max-w-[80%] self-end rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
          }
        >
          {entry.content}
        </div>
      ))}
      {showThinkingIndicator ? (
        <div
          role="status"
          aria-label="Assistant is thinking"
          className="max-w-[80%] self-start rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground"
        >
          <span className="inline-flex gap-1">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
          </span>
        </div>
      ) : null}
    </div>
  );
}
