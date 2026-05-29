import type { InterviewLogEntry } from "../types/aiInterview.types";

export type InterviewChatScrollbackProps = {
  log: InterviewLogEntry[];
};

export function InterviewChatScrollback({
  log,
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
    </div>
  );
}
