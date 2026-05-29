import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AIProvider } from "../ai.provider.js";
import type { InterviewContextRow } from "../ai.interview.schema.js";

vi.mock("../../../env.js", () => ({
  env: {
    AI_MODEL: "mock://test",
    AI_INTERVIEW_MODEL: "mock://interview",
    GROQ_API_KEY: "test-key",
    AI_CONTEXT_MESSAGE_LIMIT: 10,
  },
}));

type TxCallback = (tx: unknown) => Promise<unknown>;

const updateContextSummary = vi.fn();
const loadCompletedRow = vi.fn();
const loadApplicationName = vi.fn();

vi.mock("../ai.interview.repository.js", () => ({
  createInterviewRepository: () => ({
    loadByApplicationId: loadCompletedRow,
    applyContextSummary: updateContextSummary,
  }),
}));

vi.mock("../../../db/schema/applications.js", () => ({
  applications: { id: "id", aiEnabled: "aiEnabled", name: "name" },
}));

vi.mock("../../../db/schema/aiUsageLog.js", () => ({
  aiUsageLog: { __table: "ai_usage_log" },
}));

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>(
    "drizzle-orm",
  );
  return { ...actual, eq: (...args: unknown[]) => ({ eq: args }) };
});

const updateCalls: Array<{ table: unknown; set: unknown; where: unknown }> = [];
const usageLogInserts: unknown[] = [];

function makeTxExecutor() {
  return {
    update: vi.fn((table: unknown) => ({
      set: (values: unknown) => ({
        where: async (where: unknown) => {
          updateCalls.push({ table, set: values, where });
          return [];
        },
      }),
    })),
  };
}

vi.mock("../../../db/index.js", () => {
  return {
    db: {
      transaction: vi.fn(async (cb: TxCallback) => cb(makeTxExecutor())),
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            limit: async () => [{ name: loadApplicationName() }],
          }),
        }),
      })),
      insert: vi.fn(() => ({
        values: async (values: unknown) => {
          usageLogInserts.push(values);
          return [];
        },
      })),
    },
  };
});

const { runGenerateSummary } = await import("../ai.interview.service.js");
const { SummaryGenerationFailedError } = await import("../ai.errors.js");

const APP_ID = "app-1";
const TENANT_ID = "tenant-1";
const USER_ID = "user-1";

function makeRow(overrides: Partial<InterviewContextRow> = {}): InterviewContextRow {
  return {
    id: "ctx-1",
    applicationId: APP_ID,
    status: "completed",
    currentTurn: 8,
    interviewLog: [
      { role: "assistant", content: "Q1" },
      { role: "user", content: "A1" },
    ],
    contextSummary: null,
    completedBy: USER_ID,
    completedAt: "2026-05-29T10:00:00.000Z",
    createdAt: "2026-05-29T09:00:00.000Z",
    updatedAt: "2026-05-29T10:00:00.000Z",
    ...overrides,
  } as InterviewContextRow;
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

function makeProvider(
  result:
    | { kind: "text"; text: string; finishReason?: string }
    | { kind: "error"; error: unknown } = { kind: "text", text: VALID_SUMMARY },
): AIProvider {
  return {
    generateText: vi.fn(async () => {
      if (result.kind === "error") throw result.error;
      return {
        text: result.text,
        usage: { promptTokens: 42, completionTokens: 99 },
        finishReason: result.finishReason ?? "stop",
      };
    }) as unknown as AIProvider["generateText"],
    generateObject: vi.fn() as unknown as AIProvider["generateObject"],
  };
}

describe("runGenerateSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateCalls.length = 0;
    usageLogInserts.length = 0;
    loadApplicationName.mockReturnValue("Quick Grocer");
  });

  it("happy path: persists summary, flips aiEnabled, and logs interview_summary success", async () => {
    loadCompletedRow.mockResolvedValue(makeRow());
    updateContextSummary.mockResolvedValue(
      makeRow({ contextSummary: VALID_SUMMARY }),
    );

    const provider = makeProvider();
    const result = await runGenerateSummary({
      provider,
      applicationId: APP_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
    });

    expect(updateContextSummary).toHaveBeenCalledWith(
      "ctx-1",
      expect.stringContaining("# Application Context"),
    );

    expect(updateCalls.length).toBeGreaterThanOrEqual(1);
    expect(updateCalls[0]!.set).toMatchObject({ aiEnabled: true });

    expect(result.row.contextSummary).toContain("# Application Context");

    expect(usageLogInserts).toHaveLength(1);
    expect(usageLogInserts[0]).toMatchObject({
      action: "interview_summary",
      tenantId: TENANT_ID,
      userId: USER_ID,
      conversationId: null,
      status: "success",
      inputTokens: 42,
      outputTokens: 99,
      finishReason: "stop",
    });
    expect((usageLogInserts[0] as { model: string }).model).toBeTruthy();
    expect(
      (usageLogInserts[0] as { latencyMs: number | null }).latencyMs,
    ).not.toBeNull();
  });

  it("regeneration: overwrites prior contextSummary and logs another success row", async () => {
    loadCompletedRow.mockResolvedValue(
      makeRow({ contextSummary: "old summary" }),
    );
    updateContextSummary.mockResolvedValue(
      makeRow({ contextSummary: VALID_SUMMARY }),
    );

    const result = await runGenerateSummary({
      provider: makeProvider(),
      applicationId: APP_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
    });

    expect(updateContextSummary).toHaveBeenCalledWith(
      "ctx-1",
      expect.stringContaining("# Application Context"),
    );
    expect(result.row.contextSummary).toContain("# Application Context");

    expect(usageLogInserts).toHaveLength(1);
    expect(usageLogInserts[0]).toMatchObject({
      action: "interview_summary",
      status: "success",
    });
  });

  it("provider failure: throws, persists nothing, logs failed row", async () => {
    const { AIProviderError } = await import("../ai.errors.js");
    loadCompletedRow.mockResolvedValue(
      makeRow({ contextSummary: "old summary" }),
    );

    await expect(
      runGenerateSummary({
        provider: makeProvider({
          kind: "error",
          error: new AIProviderError("provider boom"),
        }),
        applicationId: APP_ID,
        tenantId: TENANT_ID,
        userId: USER_ID,
      }),
    ).rejects.toBeInstanceOf(SummaryGenerationFailedError);

    expect(updateContextSummary).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0);

    // One retry happens for retryable AIProviderError → two failed rows expected, then surface
    expect(usageLogInserts.length).toBeGreaterThanOrEqual(1);
    const lastLog = usageLogInserts[usageLogInserts.length - 1] as {
      action: string;
      status: string;
    };
    expect(lastLog).toMatchObject({
      action: "interview_summary",
      status: "provider_error",
    });
  });

  it("validation failure (empty output): throws, persists nothing, logs empty row", async () => {
    loadCompletedRow.mockResolvedValue(makeRow());

    await expect(
      runGenerateSummary({
        provider: makeProvider({ kind: "text", text: "   \n   " }),
        applicationId: APP_ID,
        tenantId: TENANT_ID,
        userId: USER_ID,
      }),
    ).rejects.toBeInstanceOf(SummaryGenerationFailedError);

    expect(updateContextSummary).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0);

    expect(usageLogInserts).toHaveLength(1);
    expect(usageLogInserts[0]).toMatchObject({
      action: "interview_summary",
      status: "empty",
    });
  });

  it("multiple regenerations produce multiple usage rows", async () => {
    loadCompletedRow.mockResolvedValue(makeRow());
    updateContextSummary.mockResolvedValue(
      makeRow({ contextSummary: VALID_SUMMARY }),
    );

    await runGenerateSummary({
      provider: makeProvider(),
      applicationId: APP_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
    });
    await runGenerateSummary({
      provider: makeProvider(),
      applicationId: APP_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
    });

    expect(usageLogInserts).toHaveLength(2);
    for (const row of usageLogInserts) {
      expect(row).toMatchObject({
        action: "interview_summary",
        status: "success",
      });
    }
  });

  it("throws when interview is not completed and writes no usage row", async () => {
    loadCompletedRow.mockResolvedValue(makeRow({ status: "in_progress" }));

    await expect(
      runGenerateSummary({
        provider: makeProvider(),
        applicationId: APP_ID,
        tenantId: TENANT_ID,
        userId: USER_ID,
      }),
    ).rejects.toBeInstanceOf(SummaryGenerationFailedError);

    expect(updateContextSummary).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0);
    expect(usageLogInserts).toHaveLength(0);
  });

  it("throws when interview row does not exist and writes no usage row", async () => {
    loadCompletedRow.mockResolvedValue(null);

    await expect(
      runGenerateSummary({
        provider: makeProvider(),
        applicationId: APP_ID,
        tenantId: TENANT_ID,
        userId: USER_ID,
      }),
    ).rejects.toBeInstanceOf(SummaryGenerationFailedError);

    expect(usageLogInserts).toHaveLength(0);
  });
});
