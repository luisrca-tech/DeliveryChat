import type { ReactNode } from "react";
import { cn } from "@repo/ui/lib/utils";

export type InterviewMarginaliaTone = "accent" | "amber" | "muted";

export type InterviewMarginaliaProps = {
  tone?: InterviewMarginaliaTone;
  dashed?: boolean;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
  role?: "status" | "alert";
  testId?: string;
};

const RULE_COLOR: Record<InterviewMarginaliaTone, string> = {
  accent: "var(--interview-color-accent)",
  amber: "var(--interview-color-amber)",
  muted: "var(--interview-color-muted)",
};

export function InterviewMarginalia({
  tone = "accent",
  dashed = false,
  children,
  action,
  className,
  role = "status",
  testId,
}: InterviewMarginaliaProps) {
  return (
    <div
      role={role}
      data-testid={testId}
      data-tone={tone}
      style={{
        borderLeftStyle: dashed ? "dashed" : "solid",
        borderLeftColor: RULE_COLOR[tone],
      }}
      className={cn("flex flex-col gap-2 border-l-2 pl-5 md:pl-6", className)}
    >
      <p className="interview-italic text-sm leading-relaxed text-[var(--interview-color-muted)] md:text-base">
        {children}
      </p>
      {action ? <div>{action}</div> : null}
    </div>
  );
}
