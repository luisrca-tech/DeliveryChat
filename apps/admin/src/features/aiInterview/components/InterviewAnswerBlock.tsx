import type { ReactNode } from "react";
import { cn } from "@repo/ui/lib/utils";

export type InterviewAnswerBlockProps = {
  children: ReactNode;
  className?: string;
};

export function InterviewAnswerBlock({
  children,
  className,
}: InterviewAnswerBlockProps) {
  return (
    <div
      className={cn(
        "border-l-2 border-[var(--interview-color-accent)] pl-5 text-base leading-relaxed text-[var(--interview-color-foreground)] md:pl-6 md:text-[1.0625rem]",
        className,
      )}
    >
      <p className="whitespace-pre-wrap">{children}</p>
    </div>
  );
}
