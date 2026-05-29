import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@repo/ui/components/ui/button";
import type { UseMutationResult } from "@tanstack/react-query";
import type { InterviewTurnResponse } from "../types/aiInterview.types";

export type InterviewComposerProps = {
  mutation: UseMutationResult<
    InterviewTurnResponse,
    Error,
    { message: string },
    unknown
  >;
};

export function InterviewComposer({ mutation }: InterviewComposerProps) {
  const [draft, setDraft] = useState("");
  const lastSentRef = useRef<string | null>(null);

  useEffect(() => {
    if (mutation.isError && lastSentRef.current !== null) {
      setDraft(lastSentRef.current);
      lastSentRef.current = null;
      mutation.reset();
    }
  }, [mutation.isError, mutation]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || mutation.isPending) return;
    lastSentRef.current = draft;
    setDraft("");
    mutation.mutate({ message });
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
        disabled={mutation.isPending}
        aria-label="Interview reply"
        className="min-h-[80px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      />
      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={mutation.isPending || draft.trim().length === 0}
        >
          {mutation.isPending ? "Sending..." : "Send"}
        </Button>
      </div>
    </form>
  );
}
