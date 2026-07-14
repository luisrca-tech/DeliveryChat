import { Navigate } from "@tanstack/react-router";
import "../styles/interview-theme.css";
import { useInterviewController } from "../hooks/useInterviewController";
import { InterviewChatScrollback } from "./InterviewChatScrollback";
import { InterviewComposer } from "./InterviewComposer";
import { InterviewErrorBoundary } from "./InterviewErrorBoundary";
import { InterviewEyebrow } from "./InterviewEyebrow";
import { InterviewIntroCard } from "./InterviewIntroCard";
import { InterviewRuler } from "./InterviewRuler";
import { InterviewTextLink } from "./InterviewTextLink";

export type InterviewPageProps = {
  applicationId: string;
};

function EditorialPlate({
  eyebrow,
  title,
  body,
  action,
  role = "status",
  testId,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  action?: React.ReactNode;
  role?: "status" | "alert";
  testId?: string;
}) {
  return (
    <section
      role={role}
      data-testid={testId}
      className="interview-theme flex min-h-[100dvh] w-full items-center justify-center"
    >
      <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-6 px-6 py-16 text-center">
        <InterviewEyebrow>{eyebrow}</InterviewEyebrow>
        <h1 className="interview-display text-3xl font-medium leading-[1.15] tracking-tight md:text-4xl">
          {title}
        </h1>
        {body ? (
          <p className="interview-italic max-w-[52ch] text-base leading-relaxed text-[var(--interview-color-muted)] md:text-lg">
            {body}
          </p>
        ) : null}
        {action ? <div className="pt-2">{action}</div> : null}
      </div>
    </section>
  );
}

export function InterviewPage({ applicationId }: InterviewPageProps) {
  const controller = useInterviewController(applicationId);
  const {
    phase,
    turnLog,
    progress,
    errorSurface,
    isSendingTurn,
    isStartingInterview,
    isCapExceeded,
    latestGuardrailAction,
    composer,
    callbacks,
  } = controller;

  if (phase === "loading") {
    return (
      <EditorialPlate
        eyebrow="AI Context · Loading"
        title="Opening the interview…"
      />
    );
  }

  if (phase === "load_error") {
    return (
      <EditorialPlate
        role="alert"
        eyebrow="AI Context · Error"
        title="We could not load the interview."
        body="Refresh the page to try again. Your previous answers, if any, are safe."
      />
    );
  }

  if (phase === "intro") {
    return (
      <InterviewIntroCard
        onStart={callbacks.startInterview}
        isStarting={isStartingInterview}
        errorSurface={errorSurface}
      />
    );
  }

  if (phase === "finished") {
    return (
      <Navigate
        to="/applications/$applicationId/ai-context"
        params={{ applicationId }}
        replace
      />
    );
  }

  if (phase === "finishing" || phase === "summarizing") {
    return (
      <section
        role="status"
        data-testid="interview-generating-state"
        className="interview-theme flex min-h-[100dvh] w-full items-center justify-center"
      >
        <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 px-6 py-16 text-center">
          <InterviewEyebrow>AI Context · Generating</InterviewEyebrow>
          <p className="interview-italic text-2xl leading-[1.2] text-[var(--interview-color-muted)] md:text-3xl">
            Generating your AI context…
          </p>
          <div
            aria-hidden="true"
            className="interview-accent-rule mt-2 h-px w-32 bg-[var(--interview-color-accent)] opacity-60"
          />
        </div>
      </section>
    );
  }

  if (phase === "error_summary" || phase === "summary_pending_retry") {
    return (
      <section className="interview-theme min-h-[100dvh] w-full">
        <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 px-6 py-16 text-center md:py-24">
          <InterviewErrorBoundary
            surface={errorSurface}
            onRetrySummary={callbacks.retrySummary}
          />
        </div>
      </section>
    );
  }

  const showFinishCta =
    (progress.canFinish || progress.atTurnCap) && !isCapExceeded;
  const inputLocked = progress.atTurnCap;

  const lastEntry = turnLog[turnLog.length - 1];
  const finalAssistantEntry = [...turnLog]
    .reverse()
    .find((entry) => entry.role === "assistant");
  const finalAnswered =
    finalAssistantEntry?.intent === "final_question" &&
    lastEntry?.role === "user";

  return (
    <div className="interview-theme min-h-[100dvh] w-full">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-10 md:py-14 xl:max-w-3xl">
        <div className="flex items-start justify-between gap-4">
          {phase === "active" ? (
            <InterviewRuler displayTurn={progress.displayTurn} />
          ) : (
            <div />
          )}
          <div className="flex items-center gap-3">
            {showFinishCta ? (
              <InterviewTextLink
                onClick={callbacks.finishInterview}
                data-testid="interview-finish-cta-header"
              >
                Finish interview
              </InterviewTextLink>
            ) : null}
          </div>
        </div>
        <InterviewChatScrollback
          log={turnLog}
          showThinkingIndicator={isSendingTurn}
          latestGuardrailAction={latestGuardrailAction}
        />
        {finalAnswered ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="interview-italic text-xl leading-relaxed text-[var(--interview-color-foreground)] md:text-2xl">
              We have enough to build your AI guide.
            </p>
            <InterviewTextLink
              onClick={callbacks.finishInterview}
              data-testid="interview-finish-cta-completion"
            >
              Finish interview
            </InterviewTextLink>
          </div>
        ) : showFinishCta ? (
          <div
            data-testid="interview-finish-cta-bubble"
            className="flex flex-col items-center gap-3 text-center"
          >
            <p className="interview-italic text-lg leading-relaxed text-[var(--interview-color-muted)] md:text-xl">
              We have enough context to generate your AI guide.
            </p>
            <InterviewTextLink onClick={callbacks.finishInterview}>
              Finish interview
            </InterviewTextLink>
          </div>
        ) : null}
        <InterviewErrorBoundary
          surface={errorSurface}
          onRetrySend={callbacks.retrySend}
          isSending={isSendingTurn}
        />
        {isCapExceeded ? null : (
          <InterviewComposer
            isSending={composer.isSending}
            sendDidFail={composer.sendDidFail}
            onSubmit={composer.onSubmit}
            acknowledgeFailure={composer.acknowledgeFailure}
            capReached={inputLocked}
            maxTurns={progress.maxTurns}
            onFinish={callbacks.finishInterview}
          />
        )}
      </div>
    </div>
  );
}
