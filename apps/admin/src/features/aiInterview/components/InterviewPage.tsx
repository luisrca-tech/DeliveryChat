import { useCallback, useEffect, useRef, useState } from "react";
import {
  useBootstrapInterviewMutation,
  useInterviewStateQuery,
  useSendInterviewTurnMutation,
} from "../hooks/useInterviewState";
import { InterviewChatScrollback } from "./InterviewChatScrollback";
import { InterviewComposer } from "./InterviewComposer";
import { InterviewIntroCard } from "./InterviewIntroCard";
import { InterviewProgressChip } from "./InterviewProgressChip";

export type InterviewPageProps = {
  applicationId: string;
};

export function InterviewPage({ applicationId }: InterviewPageProps) {
  const { data, isLoading, isError } = useInterviewStateQuery(applicationId);
  const bootstrap = useBootstrapInterviewMutation(applicationId);
  const [showConflictNotice, setShowConflictNotice] = useState(false);
  const handleConflict = useCallback(() => setShowConflictNotice(true), []);
  const sendTurn = useSendInterviewTurnMutation(applicationId, {
    onTurnConflict: handleConflict,
  });

  const resumeTurnRef = useRef<number | null>(null);

  useEffect(() => {
    if (sendTurn.isSuccess && showConflictNotice) {
      setShowConflictNotice(false);
    }
  }, [sendTurn.isSuccess, showConflictNotice]);

  if (isLoading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Loading interview...
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-6 text-sm text-destructive">
        Unable to load the interview.
      </div>
    );
  }

  if (data.status === "not_started") {
    return (
      <div className="p-6">
        <InterviewIntroCard
          onStart={() => bootstrap.mutate()}
          isStarting={bootstrap.isPending}
        />
      </div>
    );
  }

  if (resumeTurnRef.current === null && data.currentTurn > 0) {
    resumeTurnRef.current = data.currentTurn;
  }
  const showResumePill =
    resumeTurnRef.current !== null && resumeTurnRef.current > 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
      <div className="flex items-start justify-between gap-4">
        {showResumePill ? (
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            Resumed from turn {resumeTurnRef.current}
          </span>
        ) : (
          <span />
        )}
        <InterviewProgressChip currentTurn={data.currentTurn} />
      </div>
      {showConflictNotice ? (
        <div
          role="status"
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200"
        >
          Interview updated in another session. The latest turns have been
          loaded.
        </div>
      ) : null}
      <InterviewChatScrollback
        log={data.interviewLog}
        showThinkingIndicator={sendTurn.isPending}
      />
      <InterviewComposer mutation={sendTurn} />
    </div>
  );
}
