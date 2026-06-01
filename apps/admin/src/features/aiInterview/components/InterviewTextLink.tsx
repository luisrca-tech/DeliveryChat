import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@repo/ui/lib/utils";

export type InterviewTextLinkProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> & {
  children: ReactNode;
  loading?: boolean;
  loadingLabel?: ReactNode;
  showArrow?: boolean;
};

export function InterviewTextLink({
  children,
  loading = false,
  loadingLabel,
  showArrow = true,
  disabled,
  className,
  type = "button",
  ...rest
}: InterviewTextLinkProps) {
  const isInactive = disabled || loading;
  return (
    <button
      {...rest}
      type={type}
      disabled={isInactive}
      data-loading={loading || undefined}
      className={cn(
        "interview-textlink",
        loading && "interview-textlink--loading",
        className,
      )}
    >
      {loading ? (
        <span>{loadingLabel ?? "Working…"}</span>
      ) : (
        <>
          <span>{children}</span>
          {showArrow ? (
            <span aria-hidden="true" className="interview-textlink__arrow">
              →
            </span>
          ) : null}
        </>
      )}
    </button>
  );
}
