import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@repo/ui/components/ui/button";

export type InterviewComposerProps = {
  isSending: boolean;
  sendDidFail: boolean;
  onSubmit: (message: string) => void;
  acknowledgeFailure: () => void;
};

export function InterviewComposer({
  isSending,
  sendDidFail,
  onSubmit,
  acknowledgeFailure,
}: InterviewComposerProps) {
  const [draft, setDraft] = useState("");
  const lastSentRef = useRef<string | null>(null);

  useEffect(() => {
    if (sendDidFail && lastSentRef.current !== null) {
      setDraft(lastSentRef.current);
      lastSentRef.current = null;
      acknowledgeFailure();
    }
  }, [sendDidFail, acknowledgeFailure]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || isSending) return;
    lastSentRef.current = draft;
    setDraft("");
    onSubmit(message);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 border-t pt-4"
    >
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Type your answer..."
        rows={3}
        disabled={isSending}
        aria-label="Interview reply"
        className="min-h-[80px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      />
      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={isSending || draft.trim().length === 0}
        >
          {isSending ? "Sending..." : "Send"}
        </Button>
      </div>
    </form>
  );
}
