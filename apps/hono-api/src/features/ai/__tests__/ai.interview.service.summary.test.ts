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
const updateAiEnabled = vi.fn();
const loadCompletedRow = vi.fn();
const loadApplicationName = vi.fn();

vi.mock("../../../db/index.js", () => ({
  db: {
    transaction: vi.fn(async (cb: TxCallback) => cb({})),
  },
}));

vi.mock("../ai.interview.repository.js", () => ({
  createInterviewRepository: () => ({
    loadByApplicationId: loadCompletedRow,
    applyContextSummary: updateContextSummary,
  }),
}));

vi.mock("../../../db/schema/applications.js", () => ({
  applications: { id: "id", aiEnabled: "aiEnabled", name: "name" },
}));

const mockGenerate = vi.fn();
vi.mock("../ai.summaryGenerator.js", () => ({
  generateInterviewSummary: (...args: unknown[]) => mockGenerate(...args),
}));

// Capture executor.update calls for applications.aiEnabled flip
const updateCalls: Array<{ table: unknown; set: unknown; where: unknown }> = [];

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>(
    "drizzle-orm",
  );
  return { ...actual, eq: (...args: unknown[]) => ({ eq: args }) };
});

// db.transaction provides an executor; we mock it to expose update() that records calls
// and an internal select for application name.
function makeExecutor() {
  return {
    update: vi.fn((table: unknown) => ({
      set: (values: unknown) => ({
        where: async (where: unknown) => {
          updateCalls.push({ table, set: values, where });
          return [];
        },
      }),
    })),
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ name: loadApplicationName() }],
        }),
      }),
    })),
  };
}

vi.mock("../../../db/index.js", () => {
  return {
    db: {
      transaction: vi.fn(async (cb: TxCallback) => cb(makeExecutor())),
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

function makeProvider(): AIProvider {
  return {
    generateText: vi.fn() as unknown as AIProvider["generateText"],
    generateObject: vi.fn() as unknown as AIProvider["generateObject"],
  };
}

describe("runGenerateSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateCalls.length = 0;
    loadApplicationName.mockReturnValue("Quick Grocer");
  });

  it("happy path: persists summary and flips applications.aiEnabled=true", async () => {
    loadCompletedRow.mockResolvedValue(makeRow());
    mockGenerate.mockResolvedValue("# Application Context\n...summary...");
    updateContextSummary.mockResolvedValue(
      makeRow({ contextSummary: "# Application Context\n...summary..." }),
    );

    const provider = makeProvider();
    const result = await runGenerateSummary({
      provider,
      applicationId: APP_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
    });

    expect(mockGenerate).toHaveBeenCalledTimes(1);
    const generateArgs = mockGenerate.mock.calls[0]![1];
    expect(generateArgs).toMatchObject({
      applicationName: "Quick Grocer",
    });

    expect(updateContextSummary).toHaveBeenCalledWith(
      "ctx-1",
      "# Application Context\n...summary...",
    );

    // aiEnabled flip happens via executor.update on the applications table
    expect(updateCalls.length).toBeGreaterThanOrEqual(1);
    expect(updateCalls[0]!.set).toMatchObject({ aiEnabled: true });

    expect(result.row.contextSummary).toBe(
      "# Application Context\n...summary...",
    );
  });

  it("regeneration: overwrites prior contextSummary on success", async () => {
    loadCompletedRow.mockResolvedValue(
      makeRow({ contextSummary: "old summary" }),
    );
    mockGenerate.mockResolvedValue("new summary");
    updateContextSummary.mockResolvedValue(
      makeRow({ contextSummary: "new summary" }),
    );

    const result = await runGenerateSummary({
      provider: makeProvider(),
      applicationId: APP_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
    });

    expect(updateContextSummary).toHaveBeenCalledWith("ctx-1", "new summary");
    expect(result.row.contextSummary).toBe("new summary");
  });

  it("failure: throws SummaryGenerationFailedError and persists nothing", async () => {
    loadCompletedRow.mockResolvedValue(
      makeRow({ contextSummary: "old summary" }),
    );
    mockGenerate.mockRejectedValue(new Error("provider boom"));

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
  });

  it("throws when interview is not completed", async () => {
    loadCompletedRow.mockResolvedValue(makeRow({ status: "in_progress" }));

    await expect(
      runGenerateSummary({
        provider: makeProvider(),
        applicationId: APP_ID,
        tenantId: TENANT_ID,
        userId: USER_ID,
      }),
    ).rejects.toBeInstanceOf(SummaryGenerationFailedError);

    expect(mockGenerate).not.toHaveBeenCalled();
    expect(updateContextSummary).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0);
  });

  it("throws when interview row does not exist", async () => {
    loadCompletedRow.mockResolvedValue(null);

    await expect(
      runGenerateSummary({
        provider: makeProvider(),
        applicationId: APP_ID,
        tenantId: TENANT_ID,
        userId: USER_ID,
      }),
    ).rejects.toBeInstanceOf(SummaryGenerationFailedError);

    expect(mockGenerate).not.toHaveBeenCalled();
  });
});
