import { describe, it, expect, vi } from "vitest";

vi.mock("../../../env.js", () => ({
  env: {
    AI_MODEL: "mock://test",
    AI_INTERVIEW_MODEL: "mock://interview",
    GROQ_API_KEY: "test-key",
    AI_CONTEXT_MESSAGE_LIMIT: 10,
  },
}));

const {
  InterviewTurnEngine,
  buildAdvanceMessages,
  buildBootstrapMessages,
} = await import("../ai.interview.engine.js");
const { INTERVIEWER_SYSTEM_PROMPT } = await import(
  "../ai.prompts.interview.js"
);
const { GUARD_RAIL_RULES } = await import("../ai.interview.guardRails.js");
const {
  MAX_TURNS,
  computeCoveredTopics,
} = await import("../ai.interview.schema.js");

import type {
  InterviewContextRow,
  InterviewerOutput,
} from "../ai.interview.schema.js";

function row(overrides: Partial<InterviewContextRow> = {}): InterviewContextRow {
  return {
    id: "ctx-1",
    applicationId: "app-1",
    status: "in_progress",
    interviewLog: [],
    currentTurn: 0,
    contextSummary: null,
    completedBy: null,
    completedAt: null,
    ...overrides,
  };
}

function out(overrides: Partial<InterviewerOutput> = {}): InterviewerOutput {
  return {
    assistantMessage: "next question",
    intent: "ask",
    topicsCoveredThisTurn: [],
    guardrailAction: "none",
    ...overrides,
  };
}

describe("INTERVIEWER_SYSTEM_PROMPT", () => {
  it("contains the byte-for-byte expected header", () => {
    expect(INTERVIEWER_SYSTEM_PROMPT.startsWith(
      "You are the DeliveryChat AI Interviewer.",
    )).toBe(true);
    expect(INTERVIEWER_SYSTEM_PROMPT).toMatchSnapshot();
  });
});

describe("GUARD_RAIL_RULES", () => {
  it("none: advance=true, no marker, no suppress", () => {
    expect(GUARD_RAIL_RULES.none).toEqual({
      advanceTurn: true,
      persistMarker: null,
      suppressFinishReprompt: false,
    });
  });
  it("redirect_scope: no advance, no marker, suppress", () => {
    expect(GUARD_RAIL_RULES.redirect_scope).toEqual({
      advanceTurn: false,
      persistMarker: null,
      suppressFinishReprompt: true,
    });
  });
  it("block_extraction: no advance, no marker, suppress", () => {
    expect(GUARD_RAIL_RULES.block_extraction).toEqual({
      advanceTurn: false,
      persistMarker: null,
      suppressFinishReprompt: true,
    });
  });
  it("pushback_garbage: advance, marker, no suppress", () => {
    expect(GUARD_RAIL_RULES.pushback_garbage).toEqual({
      advanceTurn: true,
      persistMarker: "garbage_pushback",
      suppressFinishReprompt: false,
    });
  });
  it("accept_garbage: advance, no marker, no suppress", () => {
    expect(GUARD_RAIL_RULES.accept_garbage).toEqual({
      advanceTurn: true,
      persistMarker: null,
      suppressFinishReprompt: false,
    });
  });
});

describe("InterviewTurnEngine.next — bootstrap", () => {
  it("turn-0 fresh row → bootstrap_persist with assistant entry", () => {
    const decision = InterviewTurnEngine.next(row(), {
      kind: "bootstrap",
      llmOutput: out({
        assistantMessage: "Welcome!",
        topicsCoveredThisTurn: ["business_description"],
      }),
    });
    expect(decision.kind).toBe("bootstrap_persist");
    if (decision.kind !== "bootstrap_persist") return;
    expect(decision.nextLog).toEqual([
      {
        role: "assistant",
        content: "Welcome!",
        topicsCoveredThisTurn: ["business_description"],
      },
    ]);
    expect(decision.canFinish).toBe(false);
  });

  it("already-bootstrapped row → bootstrap_already_done with existing first content", () => {
    const r = row({
      currentTurn: 0,
      interviewLog: [
        { role: "assistant", content: "prior question" },
      ],
    });
    const decision = InterviewTurnEngine.next(r, {
      kind: "bootstrap",
      llmOutput: out({ assistantMessage: "different" }),
    });
    expect(decision.kind).toBe("bootstrap_already_done");
    if (decision.kind !== "bootstrap_already_done") return;
    expect(decision.output.assistantMessage).toBe("prior question");
  });

  it("null state → conflict", () => {
    const decision = InterviewTurnEngine.next(null, {
      kind: "bootstrap",
      llmOutput: out(),
    });
    expect(decision.kind).toBe("conflict");
  });
});

describe("InterviewTurnEngine.next — advance", () => {
  it("turn-0 advance with none guardrail → advance, currentTurn+1", () => {
    const r = row({
      currentTurn: 0,
      interviewLog: [{ role: "assistant", content: "Q0" }],
    });
    const baseMessages = buildAdvanceMessages(r.interviewLog, "answer", 0);
    const decision = InterviewTurnEngine.next(r, {
      kind: "advance",
      expectedCurrentTurn: 0,
      userMessage: "answer",
      llmOutput: out({
        assistantMessage: "Q1",
        topicsCoveredThisTurn: ["business_description"],
      }),
      baseMessages,
    });
    expect(decision.kind).toBe("advance");
    if (decision.kind !== "advance") return;
    expect(decision.nextTurn).toBe(1);
    expect(decision.nextLog).toHaveLength(3);
  });

  it("turn-14 advance forces intent=final_question on assistant entry", () => {
    const r = row({
      currentTurn: 14,
      interviewLog: [{ role: "assistant", content: "Q14" }],
    });
    const baseMessages = buildAdvanceMessages(r.interviewLog, "answer", 14);
    const decision = InterviewTurnEngine.next(r, {
      kind: "advance",
      expectedCurrentTurn: 14,
      userMessage: "answer",
      llmOutput: out({
        assistantMessage: "final?",
        intent: "ask",
        topicsCoveredThisTurn: ["prohibited_topics"],
      }),
      baseMessages,
    });
    expect(decision.kind).toBe("advance");
    if (decision.kind !== "advance") return;
    expect(decision.output.intent).toBe("final_question");
    expect(decision.nextTurn).toBe(15);
    const lastAssistant = [...decision.nextLog]
      .reverse()
      .find((e) => e.role === "assistant");
    expect(lastAssistant?.intent).toBe("final_question");
  });

  it("turn-15 forced_completion produces completion decision without LLM input", () => {
    const r = row({
      currentTurn: 15,
      interviewLog: [
        {
          role: "assistant",
          content: "Q15",
          intent: "final_question",
        },
      ],
    });
    const decision = InterviewTurnEngine.next(r, {
      kind: "forced_completion",
      expectedCurrentTurn: 15,
      userMessage: "last answer",
      nowIso: "2026-01-01T00:00:00.000Z",
    });
    expect(decision.kind).toBe("forced_completion");
    if (decision.kind !== "forced_completion") return;
    expect(decision.completedAt).toBe("2026-01-01T00:00:00.000Z");
    const lastUser = [...decision.nextLog]
      .reverse()
      .find((e) => e.role === "user");
    expect(lastUser?.content).toBe("last answer");
  });

  it("suggest_finish with missing topics → needs_reprompt", () => {
    const r = row({
      currentTurn: 1,
      interviewLog: [
        {
          role: "assistant",
          content: "Q",
          topicsCoveredThisTurn: ["business_description"],
        },
      ],
    });
    const baseMessages = buildAdvanceMessages(r.interviewLog, "answer", 1);
    const decision = InterviewTurnEngine.next(r, {
      kind: "advance",
      expectedCurrentTurn: 1,
      userMessage: "answer",
      llmOutput: out({
        assistantMessage: "wrap?",
        intent: "suggest_finish",
        topicsCoveredThisTurn: [],
      }),
      baseMessages,
    });
    expect(decision.kind).toBe("needs_reprompt");
    if (decision.kind !== "needs_reprompt") return;
    expect(decision.missing).toContain("target_audience");
    const lastMsg = decision.repromptMessages.at(-1);
    expect(lastMsg?.content).toMatch(/target_audience/);
  });

  it("suggest_finish with all topics covered → advance (no reprompt)", () => {
    const r = row({
      currentTurn: 1,
      interviewLog: [
        {
          role: "assistant",
          content: "Q",
          topicsCoveredThisTurn: [
            "business_description",
            "target_audience",
            "products_services",
            "preferred_tone",
            "common_support_scenarios",
          ],
        },
      ],
    });
    const baseMessages = buildAdvanceMessages(r.interviewLog, "answer", 1);
    const decision = InterviewTurnEngine.next(r, {
      kind: "advance",
      expectedCurrentTurn: 1,
      userMessage: "answer",
      llmOutput: out({
        assistantMessage: "wrap?",
        intent: "suggest_finish",
        topicsCoveredThisTurn: ["prohibited_topics"],
      }),
      baseMessages,
    });
    expect(decision.kind).toBe("advance");
  });

  it("optimistic-lock mismatch → conflict (LLM output is ignored)", () => {
    const r = row({ currentTurn: 3 });
    const decision = InterviewTurnEngine.next(r, {
      kind: "advance",
      expectedCurrentTurn: 1,
      userMessage: "answer",
      llmOutput: out(),
      baseMessages: [],
    });
    expect(decision.kind).toBe("conflict");
    if (decision.kind !== "conflict") return;
    expect(decision.currentTurn).toBe(3);
    expect(decision.status).toBe("in_progress");
  });

  it("redirect_scope guard-rail → currentTurn unchanged", () => {
    const r = row({
      currentTurn: 2,
      interviewLog: [{ role: "assistant", content: "Q" }],
    });
    const baseMessages = buildAdvanceMessages(r.interviewLog, "off-topic", 2);
    const decision = InterviewTurnEngine.next(r, {
      kind: "advance",
      expectedCurrentTurn: 2,
      userMessage: "off-topic",
      llmOutput: out({ guardrailAction: "redirect_scope" }),
      baseMessages,
    });
    expect(decision.kind).toBe("advance");
    if (decision.kind !== "advance") return;
    expect(decision.nextTurn).toBe(2);
  });

  it("pushback_garbage adds garbagePushbackTopics to user entry", () => {
    const r = row({
      currentTurn: 1,
      interviewLog: [{ role: "assistant", content: "Q" }],
    });
    const baseMessages = buildAdvanceMessages(r.interviewLog, "asdf", 1);
    const decision = InterviewTurnEngine.next(r, {
      kind: "advance",
      expectedCurrentTurn: 1,
      userMessage: "asdf",
      llmOutput: out({
        guardrailAction: "pushback_garbage",
        topicsCoveredThisTurn: ["target_audience"],
      }),
      baseMessages,
    });
    expect(decision.kind).toBe("advance");
    if (decision.kind !== "advance") return;
    const userEntry = decision.nextLog.find(
      (e) => e.role === "user" && e.content === "asdf",
    );
    expect(userEntry?.garbagePushbackTopics).toEqual(["target_audience"]);
    expect(decision.nextTurn).toBe(2);
  });
});

describe("InterviewTurnEngine.complete", () => {
  function fullyCoveredLog() {
    return [
      {
        role: "assistant" as const,
        content: "q",
        topicsCoveredThisTurn: [
          "business_description",
          "target_audience",
          "products_services",
          "preferred_tone",
          "common_support_scenarios",
          "prohibited_topics",
        ],
      },
    ];
  }

  it("null state → conflict", () => {
    const decision = InterviewTurnEngine.complete(null, {
      expectedCurrentTurn: 0,
      nowIso: "now",
    });
    expect(decision.kind).toBe("conflict");
  });

  it("turn mismatch → conflict", () => {
    const decision = InterviewTurnEngine.complete(
      row({ currentTurn: 5, interviewLog: fullyCoveredLog() }),
      { expectedCurrentTurn: 1, nowIso: "now" },
    );
    expect(decision.kind).toBe("conflict");
  });

  it("missing topics → missing_topics with the missing list", () => {
    const r = row({
      currentTurn: 1,
      interviewLog: [
        {
          role: "assistant",
          content: "q",
          topicsCoveredThisTurn: ["business_description"],
        },
      ],
    });
    const decision = InterviewTurnEngine.complete(r, {
      expectedCurrentTurn: 1,
      nowIso: "now",
    });
    expect(decision.kind).toBe("missing_topics");
    if (decision.kind !== "missing_topics") return;
    expect(decision.missing).toContain("target_audience");
  });

  it("all topics covered → complete", () => {
    const r = row({ currentTurn: 4, interviewLog: fullyCoveredLog() });
    const decision = InterviewTurnEngine.complete(r, {
      expectedCurrentTurn: 4,
      nowIso: "2026-01-01T00:00:00.000Z",
    });
    expect(decision.kind).toBe("complete");
    if (decision.kind !== "complete") return;
    expect(decision.completedAt).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("computeCoveredTopics — unknown topic warning", () => {
  it("warns and ignores unknown topic keys", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const covered = computeCoveredTopics([
      {
        role: "assistant",
        content: "q",
        topicsCoveredThisTurn: ["business_description", "made_up_topic"],
      },
    ]);
    expect(covered.has("business_description")).toBe(true);
    expect(covered.size).toBe(1);
    expect(warn).toHaveBeenCalledWith(
      "[ai.interviewer] ignoring unknown topic key:",
      "made_up_topic",
    );
    warn.mockRestore();
  });
});

describe("buildBootstrapMessages / buildAdvanceMessages / MAX_TURNS", () => {
  it("MAX_TURNS is 15", () => {
    expect(MAX_TURNS).toBe(15);
  });

  it("bootstrap messages include the kickoff user prompt", () => {
    const msgs = buildBootstrapMessages();
    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.role).toBe("user");
    expect(msgs[0]?.content).toMatch(/Start the interview/);
  });

  it("advance messages append turn-budget hint and user message", () => {
    const msgs = buildAdvanceMessages(
      [{ role: "assistant", content: "Q" }],
      "answer",
      3,
    );
    const budget = msgs.find(
      (m) => m.role === "system" && /Turn budget/.test(m.content),
    );
    expect(budget?.content).toMatch(/15/);
    expect(msgs.at(-1)).toEqual({ role: "user", content: "answer" });
  });

  it("advance messages on turn-14 include FINAL question instruction", () => {
    const msgs = buildAdvanceMessages(
      [{ role: "assistant", content: "Q" }],
      "answer",
      14,
    );
    expect(
      msgs.some(
        (m) => m.role === "system" && /FINAL question/.test(m.content),
      ),
    ).toBe(true);
  });
});
