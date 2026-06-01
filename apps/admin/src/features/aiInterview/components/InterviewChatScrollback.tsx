import type { InterviewLogEntry } from "../types/aiInterview.types";
import { InterviewAnswerBlock } from "./InterviewAnswerBlock";
import { InterviewEyebrow } from "./InterviewEyebrow";
import { InterviewQuestionBlock } from "./InterviewQuestionBlock";

export type InterviewChatScrollbackProps = {
  log: InterviewLogEntry[];
  showThinkingIndicator?: boolean;
};

type QAPair = {
  question: InterviewLogEntry;
  answer?: InterviewLogEntry;
  round: number;
};

function pairTurns(log: InterviewLogEntry[]): QAPair[] {
  const pairs: QAPair[] = [];
  let round = 0;
  for (let i = 0; i < log.length; i++) {
    const entry = log[i];
    if (!entry || entry.role !== "assistant") continue;
    round += 1;
    const next = log[i + 1];
    pairs.push({
      question: entry,
      answer: next?.role === "user" ? next : undefined,
      round,
    });
  }
  return pairs;
}

export function InterviewChatScrollback({
  log,
  showThinkingIndicator = false,
}: InterviewChatScrollbackProps) {
  const pairs = pairTurns(log);
  const nextRound = pairs.length + 1;

  return (
    <div className="flex flex-col gap-12">
      {pairs.map((pair, index) => (
        <div key={index} className="flex flex-col gap-5">
          <InterviewQuestionBlock
            topic={pair.question.topicsCoveredThisTurn?.[0]}
            round={pair.round}
          >
            {pair.question.content}
          </InterviewQuestionBlock>
          {pair.answer ? (
            <InterviewAnswerBlock>{pair.answer.content}</InterviewAnswerBlock>
          ) : null}
        </div>
      ))}
      {showThinkingIndicator ? (
        <div
          role="status"
          aria-label="Interviewer is thinking"
          className="flex flex-col gap-3"
        >
          <InterviewEyebrow variant="default">
            Interviewer is thinking · Round {nextRound}
          </InterviewEyebrow>
          <p className="interview-italic text-2xl leading-[1.2] text-[var(--interview-color-muted)] md:text-3xl">
            <span aria-hidden="true">…</span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
