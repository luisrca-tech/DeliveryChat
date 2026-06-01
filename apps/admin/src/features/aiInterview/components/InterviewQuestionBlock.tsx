import type { ReactNode } from "react";
import { cn } from "@repo/ui/lib/utils";
import { InterviewEyebrow, type InterviewEyebrowVariant } from "./InterviewEyebrow";

export type InterviewQuestionGuardrailAction =
  | "redirect_scope"
  | "pushback_garbage";

export type InterviewQuestionBlockProps = {
  topic?: string;
  round: number;
  intent?: "final_question";
  guardrailAction?: InterviewQuestionGuardrailAction;
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

type EyebrowDescriptor = {
  variant: InterviewEyebrowVariant;
  label: string;
};

function describeEyebrow(
  topicLabel: string,
  round: number,
  intent: "final_question" | undefined,
  guardrailAction: InterviewQuestionGuardrailAction | undefined,
): EyebrowDescriptor {
  if (intent === "final_question") {
    return { variant: "final", label: "Final question" };
  }
  if (guardrailAction === "pushback_garbage") {
    return { variant: "refocus", label: `Let's refocus · ${topicLabel}` };
  }
  if (guardrailAction === "redirect_scope") {
    return { variant: "staying", label: `Staying on track · ${topicLabel}` };
  }
  return { variant: "default", label: `${topicLabel} · Round ${round}` };
}

export function InterviewQuestionBlock({
  topic,
  round,
  intent,
  guardrailAction,
  children,
  className,
}: InterviewQuestionBlockProps) {
  const topicLabel =
    topic && topic.trim().length > 0 ? titleCase(topic) : "Discovery";
  const eyebrow = describeEyebrow(topicLabel, round, intent, guardrailAction);
  const showAmberUnderRule =
    eyebrow.variant === "refocus" || eyebrow.variant === "staying";

  return (
    <article className={cn("flex flex-col gap-3", className)}>
      <InterviewEyebrow variant={eyebrow.variant}>
        {eyebrow.label}
      </InterviewEyebrow>
      <h2 className="interview-display text-2xl font-medium leading-[1.2] tracking-tight text-[var(--interview-color-foreground)] md:text-3xl">
        {children}
      </h2>
      {showAmberUnderRule ? (
        <div
          aria-hidden="true"
          className="h-px w-full border-t border-dashed border-[var(--interview-color-amber-soft)]"
        />
      ) : null}
    </article>
  );
}
