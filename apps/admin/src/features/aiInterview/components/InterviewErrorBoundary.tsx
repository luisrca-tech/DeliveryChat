import type { InterviewErrorSurface } from "../lib/interviewErrorMapper";
import { InterviewEyebrow } from "./InterviewEyebrow";
import { InterviewMarginalia } from "./InterviewMarginalia";
import { InterviewTextLink } from "./InterviewTextLink";

export type InterviewErrorBoundaryProps = {
  surface: InterviewErrorSurface | null;
  onRetrySend?: () => void;
  onRetrySummary?: () => void;
  isSending?: boolean;
};

export function InterviewErrorBoundary({
  surface,
  onRetrySend,
  onRetrySummary,
  isSending = false,
}: InterviewErrorBoundaryProps) {
  if (!surface) return null;

  switch (surface.kind) {
    case "full_page_error":
      return (
        <div
          role="alert"
          data-testid="interview-summary-error"
          className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 px-6 py-12 text-center"
        >
          <InterviewEyebrow>AI Context · Error</InterviewEyebrow>
          <h2 className="interview-display text-3xl font-medium leading-[1.15] tracking-tight text-[var(--interview-color-foreground)] md:text-4xl">
            {surface.title}
          </h2>
          <p className="interview-italic max-w-[52ch] text-base leading-relaxed text-[var(--interview-color-muted)] md:text-lg">
            {surface.detail}
          </p>
          {onRetrySummary ? (
            <InterviewTextLink onClick={onRetrySummary}>
              {surface.retryLabel}
            </InterviewTextLink>
          ) : null}
        </div>
      );
    case "blocking_banner":
      return (
        <div
          role="alert"
          data-testid="interview-cap-banner"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          <div className="font-semibold">{surface.title}</div>
          <div className="mt-1 text-xs">{surface.detail}</div>
        </div>
      );
    case "missing_topics":
      return (
        <div
          role="status"
          data-testid="interview-missing-topics"
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200"
        >
          <p className="font-medium">{surface.title}</p>
          {surface.missingLabels.length > 0 ? (
            <ul className="mt-1 list-disc pl-4">
              {surface.missingLabels.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1">{surface.detail}</p>
          )}
        </div>
      );
    case "system_bubble":
      return (
        <div
          role="status"
          data-testid="interview-system-bubble"
          data-code={surface.code}
          className="max-w-[80%] self-start rounded-lg border border-dashed border-muted-foreground/40 bg-muted px-3 py-2 text-sm text-muted-foreground"
        >
          {surface.message}
        </div>
      );
    case "retry_row":
      return (
        <div data-testid="interview-retry-row" data-code={surface.code}>
          <InterviewMarginalia
            role="alert"
            tone="accent"
            dashed
            action={
              onRetrySend ? (
                <InterviewTextLink
                  onClick={onRetrySend}
                  disabled={isSending}
                  loading={isSending}
                  loadingLabel="Retrying…"
                >
                  {surface.retryLabel}
                </InterviewTextLink>
              ) : null
            }
          >
            <span className="not-italic [font-family:var(--interview-font-body)] font-medium text-[var(--interview-color-foreground)]">
              {surface.title}
            </span>
            <span className="block">{surface.detail}</span>
          </InterviewMarginalia>
        </div>
      );
    case "toast_fallback":
      return null;
    default: {
      const _exhaustive: never = surface;
      return _exhaustive;
    }
  }
}
