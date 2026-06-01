import type { ReactNode } from "react";
import { cn } from "@repo/ui/lib/utils";
import { InterviewEyebrow } from "./InterviewEyebrow";

export type InterviewQuestionBlockProps = {
  topic?: string;
  round: number;
  children: ReactNode;
  className?: string;
};

function titleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function InterviewQuestionBlock({
  topic,
  round,
  children,
  className,
}: InterviewQuestionBlockProps) {
  const topicLabel = topic && topic.trim().length > 0
    ? titleCase(topic)
    : "Discovery";
  return (
    <article className={cn("flex flex-col gap-3", className)}>
      <InterviewEyebrow variant="default">
        {topicLabel} · Round {round}
      </InterviewEyebrow>
      <h2 className="interview-display text-2xl font-medium leading-[1.2] tracking-tight text-[var(--interview-color-foreground)] md:text-3xl">
        {children}
      </h2>
    </article>
  );
}
