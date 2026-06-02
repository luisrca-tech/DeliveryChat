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
  applications: { __table: "applications", id: "id", aiEnabled: "aiEnabled", name: "name" },
}));

vi.mock("../../../db/schema/aiUsageLog.js", () => ({
  aiUsageLog: { __table: "ai_usage_log" },
}));

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>(
    "drizzle-orm",
  );
  return { ...actual, eq: (col: string, val: unknown) => ({ col, val }) };
});

type ContextStore = { row: InterviewContextRow | null; applicationName: string | null };
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
  };
}

function out(o: Partial<InterviewerOutput> = {}): InterviewerOutput {
  return {
    assistantMessage: "next question",
    intent: "ask",
    topicsCoveredThisTurn: [],
    guardrailAction: "none",
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
    expect(usageLogInserts[0]).toMatchObject({ action: "interview", status: "success" });
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
      out({ assistantMessage: "Q1", topicsCoveredThisTurn: ["business_description"] }),
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
    const provider = makeProvider([
      out({ guardrailAction: "redirect_scope" }),
    ]);

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

  it("suggest_finish with missing topics uses closing line only (no reprompt question)", async () => {
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
    const provider = makeProvider([
      out({
        assistantMessage: "Want to wrap up?",
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
    expect(result.output.assistantMessage).toBe(SUGGEST_FINISH_CLOSING_MESSAGE);
    expect(result.canFinish).toBe(true);
    expect(provider.generateObject).toHaveBeenCalledTimes(1);
    const lastAssistant = [...result.row.interviewLog]
      .reverse()
      .find((e: InterviewLogEntry) => e.role === "assistant");
    expect(lastAssistant?.intent).toBe("suggest_finish");
  });

  it("suggest_finish after user answers the last checklist question enables finish without another ask", async () => {
    const log = fullyCoveredLog();
    resetStore({
      currentTurn: CORE_TOPICS.length,
      interviewLog: [
        ...log,
        {
          role: "assistant",
          content: "Anything else?",
          topicsCoveredThisTurn: ["prohibited_topics"],
        },
      ],
    });
    const provider = makeProvider([
      out({
        assistantMessage: "All set!",
        intent: "suggest_finish",
        topicsCoveredThisTurn: [],
      }),
    ]);

    const result = await runInterviewTurn({
      provider,
      applicationId: APP_ID,
      tenantId: TENANT,
      userId: USER,
      message: "No, that's great! let's finish",
      expectedCurrentTurn: CORE_TOPICS.length,
    });

    expect(result.output.intent).toBe("suggest_finish");
    expect(result.output.assistantMessage).toBe(SUGGEST_FINISH_CLOSING_MESSAGE);
    expect(result.canFinish).toBe(true);
    expect(provider.generateObject).toHaveBeenCalledTimes(1);
    const lastAssistant = [...result.row.interviewLog]
      .reverse()
      .find((e: InterviewLogEntry) => e.role === "assistant");
    expect(lastAssistant?.content).not.toMatch(/additional prohibited/i);
  });

  it("suggest_finish with all topics covered overwrites assistantMessage with the canned closing line", async () => {
    resetStore({
      currentTurn: CORE_TOPICS.length,
      interviewLog: fullyCoveredLog(),
    });
    const llmFollowUpQuestion = "Could you describe the specific target audience?";
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
    expect(result.output.assistantMessage).toBe(SUGGEST_FINISH_CLOSING_MESSAGE);
    const lastAssistant = [...result.row.interviewLog]
      .reverse()
      .find((e: InterviewLogEntry) => e.role === "assistant");
    expect(lastAssistant?.content).toBe(SUGGEST_FINISH_CLOSING_MESSAGE);
    expect(lastAssistant?.content).not.toContain(llmFollowUpQuestion);
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
      interviewLog: [{ role: "assistant", content: "Q15", intent: "final_question" }],
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
      }),
    ).rejects.toBeInstanceOf(SummaryGenerationFailedError);
    expect(usageLogInserts).toHaveLength(0);
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
