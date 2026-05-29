import { GUARD_RAIL_RULES } from "./ai.interview.guardRails.js";
import {
  computeCoveredTopics,
  CORE_TOPICS,
  MAX_TURNS,
  missingTopics,
  type CoreTopic,
  type EngineMessage,
  type InterviewContextRow,
  type InterviewLogEntry,
  type InterviewerOutput,
} from "./ai.interview.schema.js";

export const SOFT_FINISH_WINDOW_MIN = 8;
export const SOFT_FINISH_WINDOW_MAX = 12;

export type TurnConflictDecision = {
  kind: "conflict";
  currentTurn: number;
  status: InterviewContextRow["status"] | "not_started";
};

export type BootstrapAlreadyDoneDecision = {
  kind: "bootstrap_already_done";
  output: InterviewerOutput;
  canFinish: boolean;
};

export type BootstrapPersistDecision = {
  kind: "bootstrap_persist";
  nextLog: InterviewLogEntry[];
  output: InterviewerOutput;
  canFinish: boolean;
};

export type ForcedCompletionDecision = {
  kind: "forced_completion";
  nextLog: InterviewLogEntry[];
  output: InterviewerOutput;
  completedAt: string;
};

export type NeedsRepromptDecision = {
  kind: "needs_reprompt";
  missing: CoreTopic[];
  repromptMessages: EngineMessage[];
};

export type AdvanceDecision = {
  kind: "advance";
  nextLog: InterviewLogEntry[];
  nextTurn: number;
  output: InterviewerOutput;
  canFinish: boolean;
};

export type CompleteDecision = {
  kind: "complete";
  completedAt: string;
};

export type MissingTopicsDecision = {
  kind: "missing_topics";
  missing: CoreTopic[];
};

export type TurnDecision =
  | TurnConflictDecision
  | BootstrapAlreadyDoneDecision
  | BootstrapPersistDecision
  | ForcedCompletionDecision
  | NeedsRepromptDecision
  | AdvanceDecision
  | CompleteDecision
  | MissingTopicsDecision;

export type EngineNextInput =
  | { kind: "bootstrap"; llmOutput: InterviewerOutput }
  | {
      kind: "advance";
      expectedCurrentTurn: number;
      userMessage: string;
      llmOutput: InterviewerOutput;
      baseMessages: EngineMessage[];
    }
  | {
      kind: "advance_after_reprompt";
      expectedCurrentTurn: number;
      userMessage: string;
      llmOutput: InterviewerOutput;
      originalGuardrailAction: InterviewerOutput["guardrailAction"];
    }
  | {
      kind: "forced_completion";
      expectedCurrentTurn: number;
      userMessage: string;
      nowIso: string;
    };

export type EngineCompleteInput = {
  expectedCurrentTurn: number;
  nowIso: string;
};

export function buildBootstrapMessages(): EngineMessage[] {
  return [
    {
      role: "user",
      content:
        "Start the interview. Greet the admin briefly and ask the first question covering one of the core topics.",
    },
  ];
}

export function buildAdvanceMessages(
  log: InterviewLogEntry[],
  userMessage: string,
  currentTurn: number,
): EngineMessage[] {
  const history: EngineMessage[] = log.map((entry) => ({
    role: entry.role,
    content: entry.content,
  }));

  const pushbackTopics = new Set<string>();
  for (const entry of log) {
    if (entry.role !== "user") continue;
    for (const topic of entry.garbagePushbackTopics ?? []) {
      pushbackTopics.add(topic);
    }
  }

  const messages: EngineMessage[] = [...history];

  const nextTurnNumber = currentTurn + 1;
  const remainingAfter = Math.max(0, MAX_TURNS - nextTurnNumber);
  messages.push({
    role: "system",
    content: `Turn budget: this will be question ${nextTurnNumber} of ${MAX_TURNS}. Remaining after this one: ${remainingAfter}. Pace your follow-ups so every core topic is covered before the cap.`,
  });

  const coveredSoFar = computeCoveredTopics(log);
  const allTopicsCovered = coveredSoFar.size === CORE_TOPICS.length;
  const inSoftFinishWindow =
    nextTurnNumber >= SOFT_FINISH_WINDOW_MIN &&
    nextTurnNumber <= SOFT_FINISH_WINDOW_MAX;
  if (inSoftFinishWindow && allTopicsCovered) {
    messages.push({
      role: "system",
      content: `All six core topics are already covered and this is turn ${nextTurnNumber} of ${MAX_TURNS} (inside the 8–12 finish window). It is acceptable to set intent='suggest_finish' for this turn if you have nothing essential left to ask.`,
    });
  }

  if (nextTurnNumber === MAX_TURNS) {
    messages.push({
      role: "system",
      content: `This is the FINAL question (turn ${MAX_TURNS} of ${MAX_TURNS}). You must set intent='final_question' and frame your message as the last one. Cover any remaining core topic in a single concluding question.`,
    });
  }

  if (pushbackTopics.size > 0) {
    messages.push({
      role: "system",
      content: `Prior push-back markers exist for topics: ${[...pushbackTopics].join(", ")}. If the admin's next attempt on any of these topics is still imperfect, set guardrailAction='accept_garbage' and move on so the admin is never blocked.`,
    });
  }
  messages.push({ role: "user", content: userMessage });
  return messages;
}

export function shouldForceCompletion(row: InterviewContextRow): boolean {
  return row.currentTurn >= MAX_TURNS;
}

export function next(
  state: InterviewContextRow | null,
  input: EngineNextInput,
): TurnDecision {
  if (input.kind === "bootstrap") {
    if (!state) {
      return {
        kind: "conflict",
        currentTurn: 0,
        status: "not_started",
      };
    }
    if (state.currentTurn !== 0 || state.interviewLog.length > 0) {
      const covered = computeCoveredTopics(state.interviewLog);
      return {
        kind: "bootstrap_already_done",
        output: {
          assistantMessage: state.interviewLog[0]?.content ?? "",
          intent: "ask",
          topicsCoveredThisTurn: [],
          guardrailAction: "none",
        },
        canFinish: missingTopics(covered).length === 0,
      };
    }
    const nextLog: InterviewLogEntry[] = [
      {
        role: "assistant",
        content: input.llmOutput.assistantMessage,
        topicsCoveredThisTurn: input.llmOutput.topicsCoveredThisTurn,
      },
    ];
    const covered = computeCoveredTopics(nextLog);
    return {
      kind: "bootstrap_persist",
      nextLog,
      output: input.llmOutput,
      canFinish: missingTopics(covered).length === 0,
    };
  }

  if (input.kind === "forced_completion") {
    if (!state) {
      return { kind: "conflict", currentTurn: 0, status: "not_started" };
    }
    if (
      state.status !== "in_progress" ||
      state.currentTurn !== input.expectedCurrentTurn
    ) {
      return {
        kind: "conflict",
        currentTurn: state.currentTurn,
        status: state.status,
      };
    }
    const userEntry: InterviewLogEntry = {
      role: "user",
      content: input.userMessage,
    };
    return {
      kind: "forced_completion",
      nextLog: [...state.interviewLog, userEntry],
      output: {
        assistantMessage: "",
        intent: "final_question",
        topicsCoveredThisTurn: [],
        guardrailAction: "none",
      },
      completedAt: input.nowIso,
    };
  }

  // advance + advance_after_reprompt
  if (!state) {
    return { kind: "conflict", currentTurn: 0, status: "not_started" };
  }
  if (
    state.status !== "in_progress" ||
    state.currentTurn !== input.expectedCurrentTurn
  ) {
    return {
      kind: "conflict",
      currentTurn: state.currentTurn,
      status: state.status,
    };
  }

  if (shouldForceCompletion(state)) {
    return {
      kind: "conflict",
      currentTurn: state.currentTurn,
      status: state.status,
    };
  }

  let sanitized = input.llmOutput;
  const effectiveGuardrailForAdvance =
    input.kind === "advance_after_reprompt"
      ? input.originalGuardrailAction
      : sanitized.guardrailAction;
  const advanceRules = GUARD_RAIL_RULES[effectiveGuardrailForAdvance];
  const persistRules = GUARD_RAIL_RULES[sanitized.guardrailAction];
  const isFinalQuestionTurn = state.currentTurn + 1 === MAX_TURNS;

  if (
    input.kind === "advance" &&
    !persistRules.suppressFinishReprompt &&
    sanitized.intent === "suggest_finish"
  ) {
    const projectedCovered = computeCoveredTopics([
      ...state.interviewLog,
      {
        role: "assistant",
        content: sanitized.assistantMessage,
        topicsCoveredThisTurn: sanitized.topicsCoveredThisTurn,
      },
    ]);
    const missing = missingTopics(projectedCovered);
    if (missing.length > 0) {
      const repromptMessages: EngineMessage[] = [
        ...input.baseMessages,
        {
          role: "user",
          content: `You suggested finishing, but the following core topics are still uncovered: ${missing.join(", ")}. Do not suggest finishing yet. Ask the admin a focused question that covers one of the missing topics.`,
        },
      ];
      return { kind: "needs_reprompt", missing, repromptMessages };
    }
  }

  if (input.kind === "advance_after_reprompt") {
    sanitized = { ...sanitized, intent: "ask" };
  }

  if (isFinalQuestionTurn && !advanceRules.suppressFinishReprompt) {
    sanitized = { ...sanitized, intent: "final_question" };
  }

  const userEntry: InterviewLogEntry = {
    role: "user",
    content: input.userMessage,
  };
  if (persistRules.persistMarker === "garbage_pushback") {
    userEntry.garbagePushbackTopics = sanitized.topicsCoveredThisTurn;
  }

  const assistantEntry: InterviewLogEntry = {
    role: "assistant",
    content: sanitized.assistantMessage,
    topicsCoveredThisTurn: sanitized.topicsCoveredThisTurn,
  };
  if (sanitized.intent === "final_question") {
    assistantEntry.intent = "final_question";
  }

  const nextLog: InterviewLogEntry[] = [
    ...state.interviewLog,
    userEntry,
    assistantEntry,
  ];

  const nextTurn = advanceRules.advanceTurn
    ? state.currentTurn + 1
    : state.currentTurn;

  const finalCovered = computeCoveredTopics(nextLog);
  return {
    kind: "advance",
    nextLog,
    nextTurn,
    output: sanitized,
    canFinish: missingTopics(finalCovered).length === 0,
  };
}

export function complete(
  state: InterviewContextRow | null,
  input: EngineCompleteInput,
): TurnConflictDecision | MissingTopicsDecision | CompleteDecision {
  if (!state) {
    return { kind: "conflict", currentTurn: 0, status: "not_started" };
  }
  if (
    state.status !== "in_progress" ||
    state.currentTurn !== input.expectedCurrentTurn
  ) {
    return {
      kind: "conflict",
      currentTurn: state.currentTurn,
      status: state.status,
    };
  }
  const covered = computeCoveredTopics(state.interviewLog);
  const missing = missingTopics(covered);
  if (missing.length > 0) {
    return { kind: "missing_topics", missing };
  }
  return { kind: "complete", completedAt: input.nowIso };
}

export const InterviewTurnEngine = {
  buildBootstrapMessages,
  buildAdvanceMessages,
  shouldForceCompletion,
  next,
  complete,
};
