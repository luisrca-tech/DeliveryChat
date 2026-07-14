import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AIProviderPort } from "../ai.providerPort.js";
import {
  CORE_TOPICS,
  type InterviewContextRow,
  type InterviewerOutput,
  type InterviewLogEntry,
} from "../ai.interview.schema.js";

vi.mock("../../../env.js", () => ({
  env: {
    AI_MODEL: "mock://test",
    AI_INTERVIEW_MODEL: "mock://interview",
    GROQ_API_KEY: "test-key",
    AI_CONTEXT_MESSAGE_LIMIT: 10,
  },
}));

vi.mock("../../../db/schema/applicationAiContext.js", () => ({
  applicationAiContext: {
    __table: "application_ai_context",
    id: "id",
    applicationId: "applicationId",
    interviewLog: "interviewLog",
    currentTurn: "currentTurn",
    status: "status",
    summaryStatus: "summaryStatus",
    contextSummary: "contextSummary",
    completedBy: "completedBy",
    completedAt: "completedAt",
  },
}));

vi.mock("../../../db/schema/applications.js", () => ({
  applications: {
    __table: "applications",
    id: "id",
    aiEnabled: "aiEnabled",
    name: "name",
  },
}));

vi.mock("../../../db/schema/aiUsageLog.js", () => ({
  aiUsageLog: { __table: "ai_usage_log" },
}));

vi.mock("drizzle-orm", async () => {
  const actual =
    await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return { ...actual, eq: (col: string, val: unknown) => ({ col, val }) };
});

type ContextStore = {
  row: InterviewContextRow | null;
  applicationName: string | null;
};
const store: ContextStore = { row: null, applicationName: null };
const usageLogInserts: Array<Record<string, unknown>> = [];
const applicationUpdates: Array<Record<string, unknown>> = [];

function tableName(table: unknown): string {
  return (table as { __table: string }).__table;
}

function makeExecutor() {
  return {
    select: vi.fn((shape?: Record<string, unknown>) => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async () => {
            const t = tableName(table);
            if (t === "application_ai_context") {
              return store.row ? [store.row] : [];
            }
            if (t === "applications" && shape && "name" in shape) {
              return store.applicationName
                ? [{ name: store.applicationName }]
                : [];
            }
            return [];
          },
        }),
      }),
    })),
    insert: vi.fn((table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        const t = tableName(table);
        if (t === "application_ai_context") {
          const row: InterviewContextRow = {
            id: "ctx-1",
            applicationId: values.applicationId as string,
            status: "in_progress",
            summaryStatus: "none",
            currentTurn: 0,
            interviewLog: [],
            contextSummary: null,
            completedBy: null,
            completedAt: null,
          } as InterviewContextRow;
          store.row = row;
          return {
            returning: async () => [row],
          };
        }
        if (t === "ai_usage_log") {
          usageLogInserts.push(values);
          return Promise.resolve([]);
        }
        return { returning: async () => [] };
      },
    })),
    update: vi.fn((table: unknown) => ({
      set: (values: Record<string, unknown>) => {
        const t = tableName(table);
        return {
          where: () => {
            if (t === "application_ai_context" && store.row) {
              store.row = { ...store.row, ...values } as InterviewContextRow;
            }
            if (t === "applications") {
              applicationUpdates.push(values);
            }
            return {
              returning: async () => {
                if (t === "application_ai_context" && store.row) {
                  return [store.row];
                }
                return [];
              },
            };
          },
        };
      },
    })),
  };
}

vi.mock("../../../db/index.js", () => {
  const exec = makeExecutor();
  return {
    db: {
      ...exec,
      transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
        cb(exec),
      ),
    },
  };
});

const {
  runInterviewTurn,
  runInterviewComplete,
  runGenerateSummary,
  getInterviewContext,
} = await import("../ai.interview.stateMachine.js");
const {
  TurnConflictError,
  MissingTopicsError,
  SummaryGenerationFailedError,
  AIProviderError,
} = await import("../ai.errors.js");
const { MAX_TURNS } = await import("../ai.interview.schema.js");
const { SUGGEST_FINISH_CLOSING_MESSAGE } = await import(
  "../ai.interview.stateMachine.js"
);

const TENANT = "tenant-1";
const USER = "user-1";
const APP_ID = "app-1";

function resetStore(initial?: Partial<InterviewContextRow> | null) {
  if (initial === null) {
    store.row = null;
  } else {
    store.row = {
      id: "ctx-1",
      applicationId: APP_ID,
      status: "in_progress",
      summaryStatus: "none",
      currentTurn: 0,
      interviewLog: [],
      contextSummary: null,
      completedBy: null,
      completedAt: null,
      ...initial,
    } as InterviewContextRow;
  }
  store.applicationName = "Quick Grocer";
  usageLogInserts.length = 0;
  applicationUpdates.length = 0;
}

function makeProvider(
  outputs: Array<InterviewerOutput | Error> = [],
  summaryText: string | Error | null = null,
): AIProviderPort {
  const queue = [...outputs];
  return {
    generateObject: vi.fn(async () => {
      const next = queue.shift();
      if (!next) throw new Error("provider queue empty");
      if (next instanceof Error) throw next;
      return {
        object: next,
        usage: { promptTokens: 10, completionTokens: 20 },
        finishReason: "stop",
      };
    }) as unknown as AIProviderPort["generateObject"],
    generateText: vi.fn(async () => {
      if (summaryText instanceof Error) throw summaryText;
      if (summaryText === null) throw new Error("no summary configured");
      return {
        text: summaryText,
        usage: { promptTokens: 42, completionTokens: 99 },
        finishReason: "stop",
      };
    }) as unknown as AIProviderPort["generateText"],
    generateWithTools:
      vi.fn() as unknown as AIProviderPort["generateWithTools"],
  };
}

function out(o: Partial<InterviewerOutput> = {}): InterviewerOutput {
  return {
    assistantMessage: "next question",
    intent: "ask",
    topicsCoveredThisTurn: [],
    guardrailAction: "none",
    extraContextRelevance: null,
    followUpQuestion: null,
    ...o,
  };
}

const VALID_SUMMARY = `# Application Context

## Business
desc

## Audience
aud

## Products & Services
prod

## Tone
tone

## Common Scenarios
scen

## Prohibited Topics
none

## Drafting Guidance
- be polite
- be concise`;

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
});

describe("runInterviewTurn — bootstrap", () => {
  it("creates a row when none exists and persists assistant entry", async () => {
    resetStore(null);
    const provider = makeProvider([
      out({
        assistantMessage: "Welcome!",
        topicsCoveredThisTurn: ["business_description"],
      }),
    ]);

    const result = await runInterviewTurn({
      provider,
      applicationId: APP_ID,
      tenantId: TENANT,
      userId: USER,
      message: "",
      expectedCurrentTurn: 0,
    });

    expect(result.row.currentTurn).toBe(0);
    expect(result.row.interviewLog).toHaveLength(1);
    expect(result.row.interviewLog[0]?.role).toBe("assistant");
    expect(result.row.interviewLog[0]?.content).toBe("Welcome!");
    expect(result.canFinish).toBe(false);
    expect(usageLogInserts).toHaveLength(1);
    expect(usageLogInserts[0]).toMatchObject({
      action: "interview",
      status: "success",
    });
  });

  it("bootstrap on already-bootstrapped row returns the existing first content", async () => {
    resetStore({
      currentTurn: 0,
      interviewLog: [{ role: "assistant", content: "prior question" }],
    });
    const provider = makeProvider([out({ assistantMessage: "different" })]);

    const result = await runInterviewTurn({
      provider,
      applicationId: APP_ID,
      tenantId: TENANT,
      userId: USER,
      message: "",
      expectedCurrentTurn: 0,
    });

    expect(result.output.assistantMessage).toBe("prior question");
    expect(result.row.interviewLog).toHaveLength(1);
  });
});

describe("runInterviewTurn — advance", () => {
  it("normal advance increments currentTurn and appends both entries", async () => {
    resetStore({
      currentTurn: 0,
      interviewLog: [{ role: "assistant", content: "Q0" }],
    });
    const provider = makeProvider([
      out({
        assistantMessage: "Q1",
        topicsCoveredThisTurn: ["business_description"],
      }),
    ]);

    const result = await runInterviewTurn({
      provider,
      applicationId: APP_ID,
      tenantId: TENANT,
      userId: USER,
      message: "answer",
      expectedCurrentTurn: 0,
    });

    expect(result.row.currentTurn).toBe(1);
    expect(result.row.interviewLog).toHaveLength(3);
  });

  it("turn-14 advance overrides intent to final_question", async () => {
    resetStore({
      currentTurn: 14,
      interviewLog: [{ role: "assistant", content: "Q14" }],
    });
    const provider = makeProvider([
      out({
        assistantMessage: "last?",
        intent: "ask",
        topicsCoveredThisTurn: ["prohibited_topics"],
      }),
    ]);

    const result = await runInterviewTurn({
      provider,
      applicationId: APP_ID,
      tenantId: TENANT,
      userId: USER,
      message: "answer",
      expectedCurrentTurn: 14,
    });

    expect(result.row.currentTurn).toBe(15);
    expect(result.output.intent).toBe("final_question");
    const lastAssistant = [...result.row.interviewLog]
      .reverse()
      .find((e: InterviewLogEntry) => e.role === "assistant");
    expect(lastAssistant?.intent).toBe("final_question");
  });

  it("redirect_scope guard-rail does not advance currentTurn", async () => {
    resetStore({
      currentTurn: 2,
      interviewLog: [{ role: "assistant", content: "Q" }],
    });
    const provider = makeProvider([out({ guardrailAction: "redirect_scope" })]);

    const result = await runInterviewTurn({
      provider,
      applicationId: APP_ID,
      tenantId: TENANT,
      userId: USER,
      message: "off-topic",
      expectedCurrentTurn: 2,
    });

    expect(result.row.currentTurn).toBe(2);
    expect(result.output.guardrailAction).toBe("redirect_scope");
  });

  it("pushback_garbage attaches garbagePushbackTopics to user entry", async () => {
    resetStore({
      currentTurn: 1,
      interviewLog: [{ role: "assistant", content: "Q" }],
    });
    const provider = makeProvider([
      out({
        guardrailAction: "pushback_garbage",
        topicsCoveredThisTurn: ["target_audience"],
      }),
    ]);

    const result = await runInterviewTurn({
      provider,
      applicationId: APP_ID,
      tenantId: TENANT,
      userId: USER,
      message: "asdf",
      expectedCurrentTurn: 1,
    });

    expect(result.row.currentTurn).toBe(2);
    const userEntry = result.row.interviewLog.find(
      (e: InterviewLogEntry) => e.role === "user" && e.content === "asdf",
    );
    expect(userEntry?.garbagePushbackTopics).toEqual(["target_audience"]);
  });

  it("suggest_finish preserves the LLM's assistantMessage (no override) and marks log entry intent=suggest_finish", async () => {
    resetStore({
      currentTurn: 1,
      interviewLog: [
        {
          role: "assistant",
          content: "Q",
          topicsCoveredThisTurn: ["business_description"],
        },
        { role: "user", content: "prior answer" },
      ],
    });
    const llmMessage = "Want to wrap up?";
    const provider = makeProvider([
      out({
        assistantMessage: llmMessage,
        intent: "suggest_finish",
        topicsCoveredThisTurn: [],
      }),
    ]);

    const result = await runInterviewTurn({
      provider,
      applicationId: APP_ID,
      tenantId: TENANT,
      userId: USER,
      message: "answer",
      expectedCurrentTurn: 1,
    });

    expect(result.output.intent).toBe("suggest_finish");
    expect(result.output.assistantMessage).toBe(llmMessage);
    expect(result.output.assistantMessage).not.toBe(
      SUGGEST_FINISH_CLOSING_MESSAGE,
    );
    expect(provider.generateObject).toHaveBeenCalledTimes(1);
    const lastAssistant = [...result.row.interviewLog]
      .reverse()
      .find((e: InterviewLogEntry) => e.role === "assistant");
    expect(lastAssistant?.intent).toBe("suggest_finish");
    expect(lastAssistant?.content).toBe(llmMessage);
  });

  it("suggest_finish with all topics covered preserves the LLM's assistantMessage", async () => {
    resetStore({
      currentTurn: CORE_TOPICS.length,
      interviewLog: fullyCoveredLog(),
    });
    const llmFollowUpQuestion =
      "Could you describe the specific target audience?";
    const provider = makeProvider([
      out({
        assistantMessage: llmFollowUpQuestion,
        intent: "suggest_finish",
        topicsCoveredThisTurn: [],
      }),
    ]);

    const result = await runInterviewTurn({
      provider,
      applicationId: APP_ID,
      tenantId: TENANT,
      userId: USER,
      message: "no, it's fine",
      expectedCurrentTurn: CORE_TOPICS.length,
    });

    expect(result.output.intent).toBe("suggest_finish");
    expect(result.canFinish).toBe(true);
    expect(result.output.assistantMessage).toBe(llmFollowUpQuestion);
    expect(result.output.assistantMessage).not.toBe(
      SUGGEST_FINISH_CLOSING_MESSAGE,
    );
    const lastAssistant = [...result.row.interviewLog]
      .reverse()
      .find((e: InterviewLogEntry) => e.role === "assistant");
    expect(lastAssistant?.content).toBe(llmFollowUpQuestion);
    expect(provider.generateObject).toHaveBeenCalledTimes(1);
  });

  it("final_question does not overwrite the LLM's assistant message", async () => {
    resetStore({
      currentTurn: 14,
      interviewLog: [{ role: "assistant", content: "Q14" }],
    });
    const finalQuestion = "Last one: anything else we should know?";
    const provider = makeProvider([
      out({
        assistantMessage: finalQuestion,
        intent: "ask",
        topicsCoveredThisTurn: ["prohibited_topics"],
      }),
    ]);

    const result = await runInterviewTurn({
      provider,
      applicationId: APP_ID,
      tenantId: TENANT,
      userId: USER,
      message: "answer",
      expectedCurrentTurn: 14,
    });

    expect(result.output.intent).toBe("final_question");
    expect(result.output.assistantMessage).toBe(finalQuestion);
  });

  it("throws TurnConflictError on stale expectedCurrentTurn", async () => {
    resetStore({ currentTurn: 3 });
    const provider = makeProvider([out()]);
    await expect(
      runInterviewTurn({
        provider,
        applicationId: APP_ID,
        tenantId: TENANT,
        userId: USER,
        message: "answer",
        expectedCurrentTurn: 1,
      }),
    ).rejects.toBeInstanceOf(TurnConflictError);
  });

  it("forced completion at turn cap: no LLM call, status=completed, logs forced_cap_completion", async () => {
    resetStore({
      currentTurn: MAX_TURNS,
      interviewLog: [
        { role: "assistant", content: "Q15", intent: "final_question" },
      ],
    });
    const provider = makeProvider([]); // no LLM expected

    const result = await runInterviewTurn({
      provider,
      applicationId: APP_ID,
      tenantId: TENANT,
      userId: USER,
      message: "final answer",
      expectedCurrentTurn: MAX_TURNS,
    });

    expect(result.row.status).toBe("completed");
    expect(result.row.summaryStatus).toBe("pending");
    expect(result.canFinish).toBe(true);
    expect(provider.generateObject).not.toHaveBeenCalled();
    expect(usageLogInserts).toHaveLength(1);
    expect(usageLogInserts[0]).toMatchObject({
      action: "interview_forced_completion",
      finishReason: "forced_cap_completion",
    });
  });

  it("turn-15 forced completion preserves the final assistant message under the Discovery prompt path", async () => {
    const fullyCovered = fullyCoveredLog();
    resetStore({
      currentTurn: 14,
      interviewLog: [
        ...fullyCovered,
        { role: "assistant", content: "Q14 under Discovery" },
      ],
    });

    const turn14Provider = makeProvider([
      out({
        assistantMessage: "final wrap-up question?",
        intent: "ask",
        topicsCoveredThisTurn: [],
        extraContextRelevance: "relevant",
        followUpQuestion: true,
      }),
    ]);
    const advanceResult = await runInterviewTurn({
      provider: turn14Provider,
      applicationId: APP_ID,
      tenantId: TENANT,
      userId: USER,
      message: "[relevant] add a new tone constraint about late deliveries",
      expectedCurrentTurn: 14,
    });
    expect(advanceResult.row.currentTurn).toBe(15);
    const lastAssistantAfterAdvance = [...advanceResult.row.interviewLog]
      .reverse()
      .find((e: InterviewLogEntry) => e.role === "assistant");
    expect(lastAssistantAfterAdvance?.intent).toBe("final_question");
    expect(lastAssistantAfterAdvance?.content).toBe("final wrap-up question?");

    const forcedProvider = makeProvider([]);
    const forcedResult = await runInterviewTurn({
      provider: forcedProvider,
      applicationId: APP_ID,
      tenantId: TENANT,
      userId: USER,
      message: "final answer from admin",
      expectedCurrentTurn: 15,
    });

    expect(forcedResult.row.status).toBe("completed");
    expect(forcedProvider.generateObject).not.toHaveBeenCalled();
    const lastAssistantAfterForced = [...forcedResult.row.interviewLog]
      .reverse()
      .find((e: InterviewLogEntry) => e.role === "assistant");
    expect(lastAssistantAfterForced?.intent).toBe("final_question");
    expect(lastAssistantAfterForced?.content).toBe("final wrap-up question?");
  });
});

function fullyCoveredLog(): InterviewLogEntry[] {
  const log: InterviewLogEntry[] = [];
  for (const topic of CORE_TOPICS) {
    log.push({
      role: "assistant",
      content: `q-${topic}`,
      topicsCoveredThisTurn: [topic],
    });
    log.push({ role: "user", content: `a-${topic}` });
  }
  return log;
}

describe("runInterviewComplete", () => {
  it("conflict on null row", async () => {
    resetStore(null);
    await expect(
      runInterviewComplete({
        applicationId: APP_ID,
        userId: USER,
        expectedCurrentTurn: 0,
      }),
    ).rejects.toBeInstanceOf(TurnConflictError);
  });

  it("missing topics throws MissingTopicsError", async () => {
    resetStore({
      currentTurn: 1,
      interviewLog: [
        {
          role: "assistant",
          content: "q",
          topicsCoveredThisTurn: ["business_description"],
        },
      ],
    });
    await expect(
      runInterviewComplete({
        applicationId: APP_ID,
        userId: USER,
        expectedCurrentTurn: 1,
      }),
    ).rejects.toBeInstanceOf(MissingTopicsError);
  });

  it("allows complete when last assistant turn is suggest_finish even if checklist has gaps", async () => {
    resetStore({
      currentTurn: 2,
      interviewLog: [
        {
          role: "assistant",
          content: "Q",
          topicsCoveredThisTurn: ["business_description"],
        },
        { role: "user", content: "A" },
        {
          role: "assistant",
          content: SUGGEST_FINISH_CLOSING_MESSAGE,
          intent: "suggest_finish",
        },
      ],
    });
    const { row } = await runInterviewComplete({
      applicationId: APP_ID,
      userId: USER,
      expectedCurrentTurn: 2,
    });
    expect(row.status).toBe("completed");
  });

  it("happy path transitions to completed with summaryStatus=pending", async () => {
    resetStore({ currentTurn: 4, interviewLog: fullyCoveredLog() });
    const { row } = await runInterviewComplete({
      applicationId: APP_ID,
      userId: USER,
      expectedCurrentTurn: 4,
    });
    expect(row.status).toBe("completed");
    expect(row.summaryStatus).toBe("pending");
    expect(row.completedBy).toBe(USER);
  });

  it("idempotent: already-completed row returns same row without rewriting", async () => {
    resetStore({
      status: "completed",
      summaryStatus: "ready",
      currentTurn: 4,
      interviewLog: fullyCoveredLog(),
      contextSummary: "# Summary",
      completedBy: USER,
      completedAt: "2026-01-01T00:00:00.000Z",
    });
    const { row } = await runInterviewComplete({
      applicationId: APP_ID,
      userId: USER,
      expectedCurrentTurn: 4,
    });
    expect(row.summaryStatus).toBe("ready");
    expect(row.contextSummary).toBe("# Summary");
  });
});

describe("runGenerateSummary", () => {
  function completedRow(extras: Partial<InterviewContextRow> = {}) {
    resetStore({
      status: "completed",
      summaryStatus: "pending",
      currentTurn: 8,
      interviewLog: [
        { role: "assistant", content: "Q1" },
        { role: "user", content: "A1" },
      ],
      completedBy: USER,
      completedAt: "2026-05-29T10:00:00.000Z",
      ...extras,
    });
  }

  it("happy path persists summary, flips aiEnabled, and logs interview_summary success", async () => {
    completedRow();
    const provider = makeProvider([], VALID_SUMMARY);

    const result = await runGenerateSummary({
      provider,
      applicationId: APP_ID,
      tenantId: TENANT,
      userId: USER,
      plan: "PREMIUM",
    });

    expect(result.row.contextSummary).toContain("# Application Context");
    expect(result.row.summaryStatus).toBe("ready");
    expect(applicationUpdates).toEqual(
      expect.arrayContaining([expect.objectContaining({ aiEnabled: true })]),
    );
    expect(usageLogInserts).toHaveLength(1);
    expect(usageLogInserts[0]).toMatchObject({
      action: "interview_summary",
      status: "success",
    });
  });

  it("saves the summary but leaves aiEnabled off for a FREE plan", async () => {
    completedRow();
    const provider = makeProvider([], VALID_SUMMARY);

    const result = await runGenerateSummary({
      provider,
      applicationId: APP_ID,
      tenantId: TENANT,
      userId: USER,
      plan: "FREE",
    });

    // The context is authored and stored — the org keeps everything it wrote.
    expect(result.row.contextSummary).toContain("# Application Context");
    expect(result.row.summaryStatus).toBe("ready");
    // ...but the assistant is never switched on for a plan that cannot serve.
    expect(applicationUpdates).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ aiEnabled: true })]),
    );
  });

  it("regeneration overwrites prior contextSummary", async () => {
    completedRow({
      summaryStatus: "ready",
      contextSummary: "old summary",
    });
    const provider = makeProvider([], VALID_SUMMARY);
    const result = await runGenerateSummary({
      provider,
      applicationId: APP_ID,
      tenantId: TENANT,
      userId: USER,
      plan: "PREMIUM",
    });
    expect(result.row.contextSummary).toContain("# Application Context");
  });

  it("retry from previously failed row succeeds and transitions to ready", async () => {
    completedRow({ summaryStatus: "failed" });
    const provider = makeProvider([], VALID_SUMMARY);
    const result = await runGenerateSummary({
      provider,
      applicationId: APP_ID,
      tenantId: TENANT,
      userId: USER,
      plan: "PREMIUM",
    });
    expect(result.row.summaryStatus).toBe("ready");
  });

  it("provider failure marks summaryStatus=failed without overwriting prior contextSummary", async () => {
    completedRow({
      summaryStatus: "ready",
      contextSummary: "prior ready summary",
    });
    const provider = makeProvider([], new AIProviderError("provider boom"));

    await expect(
      runGenerateSummary({
        provider,
        applicationId: APP_ID,
        tenantId: TENANT,
        userId: USER,
        plan: "PREMIUM",
      }),
    ).rejects.toBeInstanceOf(SummaryGenerationFailedError);

    expect(store.row?.summaryStatus).toBe("failed");
    expect(store.row?.contextSummary).toBe("prior ready summary");
  });

  it("validation failure (empty output) throws and writes empty usage row", async () => {
    completedRow();
    const provider = makeProvider([], "   \n   ");
    await expect(
      runGenerateSummary({
        provider,
        applicationId: APP_ID,
        tenantId: TENANT,
        userId: USER,
        plan: "PREMIUM",
      }),
    ).rejects.toBeInstanceOf(SummaryGenerationFailedError);
    expect(usageLogInserts.at(-1)).toMatchObject({
      action: "interview_summary",
      status: "empty",
    });
  });

  it("throws when interview row does not exist", async () => {
    resetStore(null);
    const provider = makeProvider([], VALID_SUMMARY);
    await expect(
      runGenerateSummary({
        provider,
        applicationId: APP_ID,
        tenantId: TENANT,
        userId: USER,
        plan: "PREMIUM",
      }),
    ).rejects.toBeInstanceOf(SummaryGenerationFailedError);
    expect(usageLogInserts).toHaveLength(0);
  });

  it("throws when interview is not completed", async () => {
    resetStore({ status: "in_progress" });
    const provider = makeProvider([], VALID_SUMMARY);
    await expect(
      runGenerateSummary({
        provider,
        applicationId: APP_ID,
        tenantId: TENANT,
        userId: USER,
        plan: "PREMIUM",
      }),
    ).rejects.toBeInstanceOf(SummaryGenerationFailedError);
    expect(usageLogInserts).toHaveLength(0);
  });
});

describe("Discovery phase — relevant classification (Phase 1)", () => {
  it("turn 8 on Hortifruti-style run preserves the LLM's follow-up question (not the canned closing line) and persists relevant + followUpQuestion=true", async () => {
    resetStore({
      currentTurn: 7,
      interviewLog: fullyCoveredLog(),
    });
    const llmFollowUp =
      "You mentioned a no-medical-advice policy — should the assistant deflect those to a human, or refuse entirely?";
    const provider = makeProvider([
      out({
        assistantMessage: llmFollowUp,
        intent: "ask",
        topicsCoveredThisTurn: [],
        extraContextRelevance: "relevant",
        followUpQuestion: true,
      }),
    ]);

    const result = await runInterviewTurn({
      provider,
      applicationId: APP_ID,
      tenantId: TENANT,
      userId: USER,
      message:
        "Also we never give medical advice — that's an absolute prohibited topic.",
      expectedCurrentTurn: 7,
    });

    expect(result.output.assistantMessage).toBe(llmFollowUp);
    expect(result.output.assistantMessage).not.toBe(
      SUGGEST_FINISH_CLOSING_MESSAGE,
    );
    expect(result.output.extraContextRelevance).toBe("relevant");
    expect(result.output.followUpQuestion).toBe(true);
    expect(result.canFinish).toBe(true);

    const lastAssistant = [...result.row.interviewLog]
      .reverse()
      .find((e: InterviewLogEntry) => e.role === "assistant");
    expect(lastAssistant?.content).toBe(llmFollowUp);
    expect(lastAssistant?.extraContextRelevance).toBe("relevant");
    expect(lastAssistant?.followUpQuestion).toBe(true);
    expect(lastAssistant?.content).not.toMatch(/\*\*/);
  });

  it("Discovery prompt injection is gated: turns 1–7 do not receive the Discovery system message", async () => {
    resetStore({
      currentTurn: 0,
      interviewLog: [{ role: "assistant", content: "Q0" }],
    });
    const provider = makeProvider([
      out({
        assistantMessage: "Q1",
        topicsCoveredThisTurn: ["business_description"],
      }),
    ]);

    await runInterviewTurn({
      provider,
      applicationId: APP_ID,
      tenantId: TENANT,
      userId: USER,
      message: "answer",
      expectedCurrentTurn: 0,
    });

    const callArgs = (provider.generateObject as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as { messages: Array<{ role: string; content: string }> };
    const systemMessages = callArgs.messages.filter((m) => m.role === "system");
    const hasDiscoveryInjection = systemMessages.some(
      (m) => /classify/i.test(m.content) && /relevant/i.test(m.content),
    );
    expect(hasDiscoveryInjection).toBe(false);
  });

  it("Discovery prompt injection appears when allTopicsCovered and nextTurnNumber > SOFT_FINISH_WINDOW_MIN", async () => {
    resetStore({
      currentTurn: 8,
      interviewLog: fullyCoveredLog(),
    });
    const provider = makeProvider([
      out({
        assistantMessage: "follow-up?",
        intent: "ask",
        topicsCoveredThisTurn: [],
        extraContextRelevance: "relevant",
        followUpQuestion: true,
      }),
    ]);

    await runInterviewTurn({
      provider,
      applicationId: APP_ID,
      tenantId: TENANT,
      userId: USER,
      message: "extra context",
      expectedCurrentTurn: 8,
    });

    const callArgs = (provider.generateObject as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as { messages: Array<{ role: string; content: string }> };
    const systemMessages = callArgs.messages.filter((m) => m.role === "system");
    const hasDiscoveryInjection = systemMessages.some(
      (m) => /classify/i.test(m.content) && /relevant/i.test(m.content),
    );
    expect(hasDiscoveryInjection).toBe(true);
  });
});

describe("Discovery phase — irrelevant + duplicate classification (Phase 2)", () => {
  it("post-coverage extra with only operational facts is classified irrelevant, with no follow-up question", async () => {
    resetStore({
      currentTurn: 7,
      interviewLog: fullyCoveredLog(),
    });
    const llmAck = "Got it — noted on the operational side.";
    const provider = makeProvider([
      out({
        assistantMessage: llmAck,
        intent: "ask",
        topicsCoveredThisTurn: [],
        extraContextRelevance: "irrelevant",
        followUpQuestion: false,
      }),
    ]);

    const result = await runInterviewTurn({
      provider,
      applicationId: APP_ID,
      tenantId: TENANT,
      userId: USER,
      message: "By the way we have 12 people on staff and around 80k MRR.",
      expectedCurrentTurn: 7,
    });

    expect(result.output.extraContextRelevance).toBe("irrelevant");
    expect(result.output.followUpQuestion).toBe(false);
    expect(result.output.assistantMessage).toBe(llmAck);

    const lastAssistant = [...result.row.interviewLog]
      .reverse()
      .find((e: InterviewLogEntry) => e.role === "assistant");
    expect(lastAssistant?.extraContextRelevance).toBe("irrelevant");
    expect(lastAssistant?.followUpQuestion).toBe(false);
  });

  it("post-coverage extra that paraphrases prior content is classified duplicate, with no follow-up question", async () => {
    resetStore({
      currentTurn: 7,
      interviewLog: fullyCoveredLog(),
    });
    const llmAck = "Thanks — that matches what you already shared earlier.";
    const provider = makeProvider([
      out({
        assistantMessage: llmAck,
        intent: "ask",
        topicsCoveredThisTurn: [],
        extraContextRelevance: "duplicate",
        followUpQuestion: false,
      }),
    ]);

    const result = await runInterviewTurn({
      provider,
      applicationId: APP_ID,
      tenantId: TENANT,
      userId: USER,
      message:
        "Just to repeat — our shoppers are mostly families looking for groceries.",
      expectedCurrentTurn: 7,
    });

    expect(result.output.extraContextRelevance).toBe("duplicate");
    expect(result.output.followUpQuestion).toBe(false);
    expect(result.output.assistantMessage).toBe(llmAck);

    const lastAssistant = [...result.row.interviewLog]
      .reverse()
      .find((e: InterviewLogEntry) => e.role === "assistant");
    expect(lastAssistant?.extraContextRelevance).toBe("duplicate");
    expect(lastAssistant?.followUpQuestion).toBe(false);
  });

  it("Discovery prompt injection documents all three classifications and the negative-example list", async () => {
    resetStore({
      currentTurn: 8,
      interviewLog: fullyCoveredLog(),
    });
    const provider = makeProvider([
      out({
        assistantMessage: "noted",
        intent: "ask",
        topicsCoveredThisTurn: [],
        extraContextRelevance: "irrelevant",
        followUpQuestion: false,
      }),
    ]);

    await runInterviewTurn({
      provider,
      applicationId: APP_ID,
      tenantId: TENANT,
      userId: USER,
      message: "extra context",
      expectedCurrentTurn: 8,
    });

    const callArgs = (provider.generateObject as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as { messages: Array<{ role: string; content: string }> };
    const discoveryMessage = callArgs.messages
      .filter((m) => m.role === "system")
      .find((m) => /classify/i.test(m.content) && /relevant/i.test(m.content));
    expect(discoveryMessage).toBeDefined();
    const content = discoveryMessage!.content;
    expect(content).toMatch(/'relevant'/);
    expect(content).toMatch(/'irrelevant'/);
    expect(content).toMatch(/'duplicate'/);
    expect(content).toMatch(/funding stage/i);
    expect(content).toMatch(/runway/i);
    expect(content).toMatch(/headcount/i);
    expect(content).toMatch(/MRR/);
    expect(content).toMatch(/internal roadmap/i);
    expect(content).toMatch(/growth metrics/i);
  });
});

describe("getInterviewContext", () => {
  it("returns null when no row exists", async () => {
    resetStore(null);
    const result = await getInterviewContext(APP_ID);
    expect(result).toBeNull();
  });

  it("returns the row when it exists", async () => {
    resetStore({ currentTurn: 3 });
    const result = await getInterviewContext(APP_ID);
    expect(result?.currentTurn).toBe(3);
  });
});
