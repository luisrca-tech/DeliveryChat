import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../env.js", () => ({
  env: {
    AI_MODEL: "mock://test",
    AI_INTERVIEW_MODEL: "mock://interview",
    GROQ_API_KEY: "test-key",
    AI_CONTEXT_MESSAGE_LIMIT: 10,
  },
}));

type Row = {
  id: string;
  applicationId: string;
  status: "in_progress" | "completed";
  currentTurn: number;
  interviewLog: Array<{
    role: "assistant" | "user";
    content: string;
    topicsCoveredThisTurn?: string[];
  }>;
  contextSummary: string | null;
  completedBy: string | null;
  completedAt: string | null;
};

const state: {
  row: Row | null;
  usageLogs: Array<Record<string, unknown>>;
} = {
  row: null,
  usageLogs: [],
};

function makeTxMock() {
  return {
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: async () => (state.row ? [{ ...state.row }] : []),
        }),
      }),
    })),
    update: vi.fn(() => ({
      set: (values: Partial<Row>) => ({
        where: () => ({
          returning: async () => {
            if (!state.row) return [];
            state.row = { ...state.row, ...values };
            return [{ ...state.row }];
          },
        }),
      }),
    })),
    insert: vi.fn((table: unknown) => ({
      values: async (values: Record<string, unknown>) => {
        // The interviewer code never inserts into applicationAiContext during advance;
        // bootstrap inserts a fresh row. Track usage log inserts so we can assert on them.
        state.usageLogs.push({ table, values });
      },
    })),
  };
}

const txMock = makeTxMock();

vi.mock("../../../db/index.js", () => ({
  db: {
    select: () => txMock.select(),
    update: (arg: unknown) => (txMock.update as (a: unknown) => unknown)(arg),
    insert: (arg: unknown) => (txMock.insert as (a: unknown) => unknown)(arg),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(txMock)),
  },
}));

vi.mock("../../../db/schema/applicationAiContext.js", () => ({
  applicationAiContext: {
    id: "id",
    applicationId: "applicationId",
    interviewLog: "interviewLog",
    currentTurn: "currentTurn",
    status: "status",
  },
}));

vi.mock("../../../db/schema/aiUsageLog.js", () => ({
  aiUsageLog: { __table: "ai_usage_log" },
}));

vi.mock("../ai.sanitize.js", () => ({
  sanitizeAiMarkdown: (s: string) => s,
}));

const {
  CORE_TOPICS,
  interviewerOutputSchema,
  runAdvanceTurn,
  runCompleteInterview,
  computeCoveredTopics,
  MissingTopicsError,
  TurnConflictError,
} = await import("../ai.interviewer.js");

type ProviderObjectArgs = {
  systemPrompt: string;
  messages: Array<{ role: string; content: string }>;
  model: string;
  schema: unknown;
};

function makeProvider(impl: (args: ProviderObjectArgs) => Promise<unknown> | unknown) {
  return {
    generateText: vi.fn(),
    generateObject: vi.fn(async (args: ProviderObjectArgs) => {
      const out = await impl(args);
      return {
        object: out,
        usage: { promptTokens: 12, completionTokens: 8 },
        finishReason: "stop",
      };
    }),
  };
}

function seedRow(overrides: Partial<Row> = {}) {
  state.row = {
    id: "ctx-1",
    applicationId: "app-1",
    status: "in_progress",
    currentTurn: 0,
    interviewLog: [{ role: "assistant", content: "Welcome — tell me about your business." }],
    contextSummary: null,
    completedBy: null,
    completedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  state.row = null;
  state.usageLogs = [];
  vi.clearAllMocks();
});

describe("ai.interviewer schema + constants", () => {
  it("CORE_TOPICS covers the contract", () => {
    expect(CORE_TOPICS).toEqual(
      expect.arrayContaining([
        "business_description",
        "target_audience",
        "products_services",
        "preferred_tone",
        "common_support_scenarios",
        "prohibited_topics",
      ]),
    );
  });

  it("interviewerOutputSchema accepts a valid structured output", () => {
    expect(() =>
      interviewerOutputSchema.parse({
        assistantMessage: "Tell me about your business.",
        intent: "ask",
        topicsCoveredThisTurn: ["business_description"],
        guardrailAction: "none",
      }),
    ).not.toThrow();
  });

  it("interviewerOutputSchema rejects unknown intent / guardrailAction", () => {
    expect(() =>
      interviewerOutputSchema.parse({
        assistantMessage: "hi",
        intent: "wrong",
        topicsCoveredThisTurn: [],
        guardrailAction: "none",
      }),
    ).toThrow();
  });

  it("interviewerOutputSchema requires assistantMessage to be non-empty", () => {
    expect(() =>
      interviewerOutputSchema.parse({
        assistantMessage: "",
        intent: "ask",
        topicsCoveredThisTurn: [],
        guardrailAction: "none",
      }),
    ).toThrow();
  });
});

describe("runAdvanceTurn", () => {
  it("throws TurnConflictError when no row exists", async () => {
    const provider = makeProvider(() => ({
      assistantMessage: "next",
      intent: "ask",
      topicsCoveredThisTurn: [],
      guardrailAction: "none",
    }));

    await expect(
      runAdvanceTurn({
        provider,
        applicationId: "app-1",
        tenantId: "org-1",
        userId: "user-1",
        userMessage: "We sell books.",
        expectedCurrentTurn: 0,
      }),
    ).rejects.toBeInstanceOf(TurnConflictError);

    expect(provider.generateObject).not.toHaveBeenCalled();
  });

  it("throws TurnConflictError with current turn when expectedCurrentTurn is stale", async () => {
    seedRow({ currentTurn: 2 });
    const provider = makeProvider(() => ({
      assistantMessage: "next",
      intent: "ask",
      topicsCoveredThisTurn: [],
      guardrailAction: "none",
    }));

    let caught: unknown;
    try {
      await runAdvanceTurn({
        provider,
        applicationId: "app-1",
        tenantId: "org-1",
        userId: "user-1",
        userMessage: "answer",
        expectedCurrentTurn: 1,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(TurnConflictError);
    expect((caught as InstanceType<typeof TurnConflictError>).currentTurn).toBe(2);
    expect((caught as InstanceType<typeof TurnConflictError>).status).toBe("in_progress");
    expect(provider.generateObject).not.toHaveBeenCalled();
  });

  it("throws TurnConflictError when status is completed", async () => {
    seedRow({ currentTurn: 5, status: "completed" });
    const provider = makeProvider(() => ({
      assistantMessage: "next",
      intent: "ask",
      topicsCoveredThisTurn: [],
      guardrailAction: "none",
    }));

    let caught: unknown;
    try {
      await runAdvanceTurn({
        provider,
        applicationId: "app-1",
        tenantId: "org-1",
        userId: "user-1",
        userMessage: "answer",
        expectedCurrentTurn: 5,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(TurnConflictError);
    expect((caught as InstanceType<typeof TurnConflictError>).status).toBe("completed");
  });

  it("appends user + assistant messages, increments currentTurn, and logs usage", async () => {
    seedRow({
      currentTurn: 0,
      interviewLog: [{ role: "assistant", content: "Tell me about your business." }],
    });

    const provider = makeProvider((args) => {
      // Last message must be the user's new answer
      const last = args.messages[args.messages.length - 1];
      expect(last).toEqual({ role: "user", content: "We sell books online." });
      return {
        assistantMessage: "Who are your typical customers?",
        intent: "ask",
        topicsCoveredThisTurn: ["business_description"],
        guardrailAction: "none",
      };
    });

    const result = await runAdvanceTurn({
      provider,
      applicationId: "app-1",
      tenantId: "org-1",
      userId: "user-1",
      userMessage: "We sell books online.",
      expectedCurrentTurn: 0,
    });

    expect(result.row.currentTurn).toBe(1);
    expect(result.row.interviewLog).toEqual([
      { role: "assistant", content: "Tell me about your business." },
      { role: "user", content: "We sell books online." },
      {
        role: "assistant",
        content: "Who are your typical customers?",
        topicsCoveredThisTurn: ["business_description"],
      },
    ]);
    expect(result.output.intent).toBe("ask");
    expect(result.output.topicsCoveredThisTurn).toEqual(["business_description"]);

    expect(state.usageLogs).toHaveLength(1);
    expect(state.usageLogs[0]?.values).toMatchObject({
      tenantId: "org-1",
      userId: "user-1",
      action: "interview",
      model: "mock://interview",
      inputTokens: 12,
      outputTokens: 8,
      finishReason: "stop",
      status: "success",
    });
  });

  it("propagates LLM failures without mutating the row (transaction rolls back)", async () => {
    seedRow({ currentTurn: 1 });
    const snapshot = JSON.parse(JSON.stringify(state.row));

    const provider = {
      generateText: vi.fn(),
      generateObject: vi.fn(async () => {
        throw new Error("LLM exploded");
      }),
    };

    await expect(
      runAdvanceTurn({
        provider,
        applicationId: "app-1",
        tenantId: "org-1",
        userId: "user-1",
        userMessage: "answer",
        expectedCurrentTurn: 1,
      }),
    ).rejects.toThrow("LLM exploded");

    // No update should have been written before the failure propagated.
    expect(state.row).toEqual(snapshot);
    expect(state.usageLogs).toHaveLength(0);
  });
});

describe("computeCoveredTopics", () => {
  it("returns the union of topicsCoveredThisTurn across assistant entries", () => {
    const log = [
      {
        role: "assistant" as const,
        content: "q1",
        topicsCoveredThisTurn: ["business_description"],
      },
      { role: "user" as const, content: "a1" },
      {
        role: "assistant" as const,
        content: "q2",
        topicsCoveredThisTurn: ["target_audience", "business_description"],
      },
    ];
    const covered = computeCoveredTopics(log);
    expect(covered.has("business_description")).toBe(true);
    expect(covered.has("target_audience")).toBe(true);
    expect(covered.size).toBe(2);
  });

  it("ignores unknown topic keys silently", () => {
    const log = [
      {
        role: "assistant" as const,
        content: "q",
        topicsCoveredThisTurn: ["business_description", "made_up_topic"],
      },
    ];
    const covered = computeCoveredTopics(log);
    expect(covered.has("business_description")).toBe(true);
    expect(covered.size).toBe(1);
  });

  it("handles assistant entries without topicsCoveredThisTurn", () => {
    const log = [{ role: "assistant" as const, content: "no topics" }];
    expect(computeCoveredTopics(log).size).toBe(0);
  });
});

describe("runAdvanceTurn: suggest_finish handling", () => {
  function fullyCoveredLog() {
    return [
      {
        role: "assistant" as const,
        content: "q0",
        topicsCoveredThisTurn: [
          "business_description",
          "target_audience",
          "products_services",
          "preferred_tone",
          "common_support_scenarios",
        ],
      },
    ];
  }

  it("exposes canFinish: true when all core topics are covered after the turn", async () => {
    seedRow({ currentTurn: 1, interviewLog: fullyCoveredLog() });

    const provider = makeProvider(() => ({
      assistantMessage: "Ready to wrap up?",
      intent: "suggest_finish",
      topicsCoveredThisTurn: ["prohibited_topics"],
      guardrailAction: "none",
    }));

    const result = await runAdvanceTurn({
      provider,
      applicationId: "app-1",
      tenantId: "org-1",
      userId: "user-1",
      userMessage: "no banned topics",
      expectedCurrentTurn: 1,
    });

    expect(result.canFinish).toBe(true);
    expect(result.output.intent).toBe("suggest_finish");
    expect(provider.generateObject).toHaveBeenCalledTimes(1);
  });

  it("downgrades suggest_finish to ask and re-prompts when topics are missing", async () => {
    seedRow({
      currentTurn: 1,
      interviewLog: [
        {
          role: "assistant",
          content: "q0",
          topicsCoveredThisTurn: ["business_description"],
        },
      ],
    });

    const responses = [
      {
        assistantMessage: "Done?",
        intent: "suggest_finish",
        topicsCoveredThisTurn: [],
        guardrailAction: "none",
      },
      {
        assistantMessage: "Who is your target audience?",
        intent: "ask",
        topicsCoveredThisTurn: [],
        guardrailAction: "none",
      },
    ];
    let call = 0;
    const provider = makeProvider(() => responses[call++]!);

    const result = await runAdvanceTurn({
      provider,
      applicationId: "app-1",
      tenantId: "org-1",
      userId: "user-1",
      userMessage: "sure",
      expectedCurrentTurn: 1,
    });

    expect(provider.generateObject).toHaveBeenCalledTimes(2);
    expect(result.output.intent).toBe("ask");
    expect(result.output.assistantMessage).toBe(
      "Who is your target audience?",
    );
    expect(result.canFinish).toBe(false);
    // Re-prompt should mention missing topics
    const secondCall = provider.generateObject.mock.calls[1]![0];
    const lastMessage =
      secondCall.messages[secondCall.messages.length - 1]!.content;
    expect(lastMessage).toMatch(/target_audience/);
  });
});

describe("runCompleteInterview", () => {
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

  it("throws TurnConflictError when no row exists", async () => {
    await expect(
      runCompleteInterview({
        applicationId: "app-1",
        userId: "user-1",
        expectedCurrentTurn: 0,
      }),
    ).rejects.toBeInstanceOf(TurnConflictError);
  });

  it("throws TurnConflictError when expectedCurrentTurn is stale", async () => {
    seedRow({ currentTurn: 3, interviewLog: fullyCoveredLog() });
    await expect(
      runCompleteInterview({
        applicationId: "app-1",
        userId: "user-1",
        expectedCurrentTurn: 1,
      }),
    ).rejects.toBeInstanceOf(TurnConflictError);
  });

  it("throws TurnConflictError when already completed", async () => {
    seedRow({
      currentTurn: 3,
      status: "completed",
      interviewLog: fullyCoveredLog(),
    });
    await expect(
      runCompleteInterview({
        applicationId: "app-1",
        userId: "user-1",
        expectedCurrentTurn: 3,
      }),
    ).rejects.toBeInstanceOf(TurnConflictError);
  });

  it("throws MissingTopicsError when checklist is not satisfied", async () => {
    seedRow({
      currentTurn: 2,
      interviewLog: [
        {
          role: "assistant",
          content: "q",
          topicsCoveredThisTurn: ["business_description"],
        },
      ],
    });

    let caught: unknown;
    try {
      await runCompleteInterview({
        applicationId: "app-1",
        userId: "user-1",
        expectedCurrentTurn: 2,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(MissingTopicsError);
    expect((caught as InstanceType<typeof MissingTopicsError>).missing).toEqual(
      expect.arrayContaining(["target_audience", "products_services"]),
    );
  });

  it("marks the row completed and sets completedBy/completedAt when checklist passes", async () => {
    seedRow({ currentTurn: 4, interviewLog: fullyCoveredLog() });

    const result = await runCompleteInterview({
      applicationId: "app-1",
      userId: "user-1",
      expectedCurrentTurn: 4,
    });

    expect(result.row.status).toBe("completed");
    expect(result.row.completedBy).toBe("user-1");
    expect(result.row.completedAt).toBeTruthy();
    // contextSummary stays null; applications.aiEnabled is Phase 4's job
    expect(result.row.contextSummary).toBeNull();
  });
});
