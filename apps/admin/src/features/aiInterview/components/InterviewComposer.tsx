import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { InterviewTextLink } from "./InterviewTextLink";

export type InterviewComposerProps = {
  isSending: boolean;
  sendDidFail: boolean;
  onSubmit: (message: string) => void;
  acknowledgeFailure: () => void;
  capReached?: boolean;
  maxTurns?: number;
  onFinish?: () => void;
};

const DEFAULT_PLACEHOLDER = "Share your answer…";
const CAP_PLACEHOLDER =
  "You have reached the turn limit. Finish the interview to generate your AI context.";

function capPlaceholder(maxTurns?: number) {
  if (!maxTurns) return CAP_PLACEHOLDER;
  return `You have reached the ${maxTurns}-turn limit. Finish the interview to generate your AI context.`;
}

export function InterviewComposer({
  isSending,
  sendDidFail,
  onSubmit,
  acknowledgeFailure,
  capReached = false,
  maxTurns,
  onFinish,
}: InterviewComposerProps) {
  const [draft, setDraft] = useState("");
  const lastSentRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (sendDidFail && lastSentRef.current !== null) {
      setDraft(lastSentRef.current);
      lastSentRef.current = null;
      acknowledgeFailure();
    }
  }, [sendDidFail, acknowledgeFailure]);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  const submit = () => {
    const message = draft.trim();
    if (!message || isSending || capReached) return;
    lastSentRef.current = draft;
    setDraft("");
    onSubmit(message);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const ruleColor = capReached
    ? "var(--interview-color-muted)"
    : "var(--interview-color-accent)";
  const placeholder = capReached
    ? capPlaceholder(maxTurns)
    : DEFAULT_PLACEHOLDER;
  const lockedProps = capReached
    ? { "data-testid": "interview-input-locked" }
    : {};

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3"
      {...lockedProps}
    >
      <div
        style={{ borderLeftColor: ruleColor }}
        className="border-l-2 pl-5 md:pl-6"
      >
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={capReached}
          aria-label="Interview reply"
          rows={1}
          className="interview-composer__textarea w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-base leading-relaxed text-[var(--interview-color-foreground)] outline-none placeholder:italic placeholder:text-[var(--interview-color-muted)] placeholder:[font-family:var(--interview-font-display)] disabled:cursor-not-allowed md:text-[1.0625rem]"
          style={{ fontFamily: "var(--interview-font-body)" }}
        />
      </div>
      <div className="flex items-center justify-between gap-4 pl-5 md:pl-6">
        <p className="interview-eyebrow text-[var(--interview-color-muted)]">
          {capReached
            ? "Interview turn limit reached"
            : "⏎ to send · ⇧⏎ for new line"}
        </p>
        {capReached ? (
          <InterviewTextLink onClick={onFinish}>
            Finish interview
          </InterviewTextLink>
        ) : (
          <InterviewTextLink
            type="submit"
            loading={isSending}
            loadingLabel="Sending…"
            disabled={draft.trim().length === 0}
          >
            Send
          </InterviewTextLink>
        )}
      </div>
    </form>
  );
}
