import type { InterviewLogEntry } from "../types/aiInterview.types";
import { InterviewAnswerBlock } from "./InterviewAnswerBlock";
import { InterviewEyebrow } from "./InterviewEyebrow";
import {
  InterviewQuestionBlock,
  type InterviewQuestionGuardrailAction,
} from "./InterviewQuestionBlock";

export type InterviewChatScrollbackProps = {
  log: InterviewLogEntry[];
  showThinkingIndicator?: boolean;
  latestGuardrailAction?: InterviewQuestionGuardrailAction;
};

type QAPair = {
  question: InterviewLogEntry;
  answer?: InterviewLogEntry;
  previousUser?: InterviewLogEntry;
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
    const prev = log[i - 1];
    pairs.push({
      question: entry,
      answer: next?.role === "user" ? next : undefined,
      previousUser: prev?.role === "user" ? prev : undefined,
      round,
    });
  }
  return pairs;
}

function deriveGuardrail(
  pair: QAPair,
  isLast: boolean,
  latest?: InterviewQuestionGuardrailAction,
): InterviewQuestionGuardrailAction | undefined {
  if (pair.previousUser?.garbagePushbackTopics?.length) {
    return "pushback_garbage";
  }
  if (isLast && latest) return latest;
  return undefined;
}

export function InterviewChatScrollback({
  log,
  showThinkingIndicator = false,
  latestGuardrailAction,
}: InterviewChatScrollbackProps) {
  const pairs = pairTurns(log);
  const nextRound = pairs.length + 1;

  return (
    <div className="flex flex-col gap-12">
      {pairs.map((pair, index) => {
        const isLast = index === pairs.length - 1;
        const guardrail = deriveGuardrail(pair, isLast, latestGuardrailAction);
        return (
          <div key={index} className="flex flex-col gap-5">
            <InterviewQuestionBlock
              topic={pair.question.topicsCoveredThisTurn?.[0]}
              round={pair.round}
              intent={pair.question.intent}
              guardrailAction={guardrail}
            >
              {pair.question.content}
            </InterviewQuestionBlock>
            {pair.answer ? (
              <InterviewAnswerBlock>{pair.answer.content}</InterviewAnswerBlock>
            ) : null}
          </div>
        );
      })}
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
