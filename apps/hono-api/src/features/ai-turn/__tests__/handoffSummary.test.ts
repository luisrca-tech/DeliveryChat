import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@repo/lexical-utils", () => ({
  serializeLexicalToPlainText: vi.fn((content: string) => content),
}));

vi.mock("../../../env.js", () => ({
  env: {
    AI_MODEL: "mock://test",
    GROQ_API_KEY: "test-key",
    AI_CONTEXT_MESSAGE_LIMIT: 10,
  },
}));

vi.mock("../../ai/ai.groqProvider.js", () => ({ createAIProvider: vi.fn() }));

vi.mock("../loadContext.js", () => ({
  loadConversationMessages: vi.fn(),
}));

// runAICall stays REAL — it only needs db.insert for the usage log. We capture
// the conversations UPDATE via db.update.
let capturedSet: Record<string, unknown> | null = null;
vi.mock("../../../db/index.js", () => ({
  db: {
    insert: vi.fn(() => ({ values: vi.fn(() => Promise.resolve()) })),
    update: vi.fn(() => ({
      set: vi.fn((v: Record<string, unknown>) => {
        capturedSet = v;
        return { where: vi.fn(() => Promise.resolve()) };
      }),
    })),
  },
}));

const { createAIProvider } = await import("../../ai/ai.groqProvider.js");
const loadContext = await import("../loadContext.js");
const { db } = await import("../../../db/index.js");
const { QUOTA_EXCLUDED_ACTIONS } = await import("../../ai/ai.quota.js");
const { generateHandoffSummary } = await import("../handoffSummary.js");

const mockCreateProvider = createAIProvider as ReturnType<typeof vi.fn>;
const mockLoadMessages = loadContext.loadConversationMessages as ReturnType<
  typeof vi.fn
>;
const mockDbUpdate = db.update as ReturnType<typeof vi.fn>;

const CONVERSATION = {
  id: "conv-1",
  organizationId: "org-1",
  applicationId: "app-1",
  status: "pending",
  handledBy: "human",
  assignedTo: null,
  createdBy: "visitor-1",
  subject: "Help",
  createdAt: "2026-07-10T00:00:00.000Z",
};

const MESSAGES = [
  { authorType: "visitor", senderId: "v1", content: "Do you ship to Brazil?", contentFormat: "plain", createdAt: "2026-07-10T00:00:00.000Z" },
  { authorType: "ai", senderId: null, content: "Let me check.", contentFormat: "plain", createdAt: "2026-07-10T00:00:01.000Z" },
];

function providerReturning(text: string) {
  return {
    generateText: vi.fn(async () => ({
      text,
      usage: { promptTokens: 10, completionTokens: 5 },
      finishReason: "stop",
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedSet = null;
});

describe("generateHandoffSummary", () => {
  it("generates and persists a summary onto the conversation", async () => {
    mockLoadMessages.mockResolvedValue(MESSAGES);
    const provider = providerReturning("Visitor asks about shipping to Brazil.");
    mockCreateProvider.mockReturnValue(provider);

    await generateHandoffSummary(CONVERSATION);

    expect(provider.generateText).toHaveBeenCalledTimes(1);
    expect(mockDbUpdate).toHaveBeenCalled();
    expect(capturedSet).toMatchObject({
      handoffSummary: "Visitor asks about shipping to Brazil.",
    });
  });

  it("never throws and does not persist when the provider fails", async () => {
    mockLoadMessages.mockResolvedValue(MESSAGES);
    const provider = {
      generateText: vi.fn(async () => {
        throw new Error("provider down");
      }),
    };
    mockCreateProvider.mockReturnValue(provider);

    await expect(generateHandoffSummary(CONVERSATION)).resolves.toBeUndefined();
    expect(capturedSet).toBeNull();
  });

  it("skips generation entirely for an empty transcript", async () => {
    mockLoadMessages.mockResolvedValue([]);
    mockCreateProvider.mockReturnValue(providerReturning("unused"));

    await generateHandoffSummary(CONVERSATION);

    expect(mockCreateProvider).not.toHaveBeenCalled();
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it("uses the quota-excluded 'handoff_summary' action so it never consumes AI quota", () => {
    // Structural guarantee: the action the generator logs is excluded from the
    // monthly cap computation.
    expect(QUOTA_EXCLUDED_ACTIONS).toContain("handoff_summary");
  });
});
