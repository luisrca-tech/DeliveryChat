import type { ReactNode } from "react";
import { cn } from "@repo/ui/lib/utils";

export type InterviewEyebrowVariant =
  | "default"
  | "final"
  | "refocus"
  | "staying"
  | "progress";

export type InterviewEyebrowProps = {
  variant?: InterviewEyebrowVariant;
  children: ReactNode;
  className?: string;
};

const TONE_CLASSES: Record<InterviewEyebrowVariant, string> = {
  default: "text-[var(--interview-color-muted)]",
  progress: "text-[var(--interview-color-muted)]",
  final: "text-[var(--interview-color-accent)]",
  refocus: "text-[var(--interview-color-amber)]",
  staying: "text-[var(--interview-color-amber)]",
};

const RULE_CLASSES: Record<InterviewEyebrowVariant, string> = {
  default:
    "after:mt-2 after:block after:h-px after:w-full after:bg-[var(--interview-color-rule)] after:content-['']",
  progress:
    "after:mt-2 after:block after:h-px after:w-full after:bg-[var(--interview-color-rule)] after:content-['']",
  final: "",
  refocus:
    "after:mt-2 after:block after:h-px after:w-full after:border-t after:border-dashed after:border-[var(--interview-color-amber-soft)] after:content-['']",
  staying:
    "after:mt-2 after:block after:h-px after:w-full after:border-t after:border-dashed after:border-[var(--interview-color-amber-soft)] after:content-['']",
};

export function InterviewEyebrow({
  variant = "default",
  children,
  className,
}: InterviewEyebrowProps) {
  return (
    <p
      data-variant={variant}
      className={cn(
        "interview-eyebrow",
        TONE_CLASSES[variant],
        RULE_CLASSES[variant],
        className,
      )}
    >
      {children}
    </p>
  );
}
