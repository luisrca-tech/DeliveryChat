import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Module mocks (seams around runAiTurn) ─────────────────────────────────────
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
vi.mock("../../ai/ai.quota.js", () => ({ checkAiQuota: vi.fn() }));

vi.mock("../../chat/broadcasting.service.js", () => ({
  broadcastRoomEvent: vi.fn(),
  buildTypingStartEvent: vi.fn((p: unknown) => ({ type: "typing:start", payload: p })),
  buildTypingStopEvent: vi.fn((p: unknown) => ({ type: "typing:stop", payload: p })),
}));

vi.mock("../../chat/chat.service.js", () => ({ sendMessage: vi.fn() }));
vi.mock("../escalate.js", () => ({ escalateConversation: vi.fn() }));
vi.mock("../../ai-data/index.js", () => ({ executeDataTool: vi.fn() }));

vi.mock("../loadContext.js", () => ({
  loadTurnContext: vi.fn(),
  loadConversationMessages: vi.fn(),
  loadDataToolset: vi.fn(),
  loadIsCustomTenant: vi.fn(),
  loadContextSummary: vi.fn(),
}));

// runAICall stays REAL — it only needs db.insert for the usage log.
vi.mock("../../../db/index.js", () => ({
  db: { insert: vi.fn(() => ({ values: vi.fn(() => Promise.resolve()) })) },
}));

const { createAIProvider } = await import("../../ai/ai.groqProvider.js");
const { checkAiQuota } = await import("../../ai/ai.quota.js");
const chatService = await import("../../chat/chat.service.js");
const escalateMod = await import("../escalate.js");
const aiData = await import("../../ai-data/index.js");
const loadContext = await import("../loadContext.js");
const { db } = await import("../../../db/index.js");
const { MockProvider } = await import("../../ai/ai.mockProvider.js");
const { AIProviderRateLimitError } = await import("../../ai/ai.errors.js");
const { ESCALATE_TOOL_NAME } = await import("../tools.js");

const { runAiTurn } = await import("../runAiTurn.js");

const mockCreateProvider = createAIProvider as ReturnType<typeof vi.fn>;
const mockCheckQuota = checkAiQuota as ReturnType<typeof vi.fn>;
const mockSendMessage = chatService.sendMessage as ReturnType<typeof vi.fn>;
const mockEscalate = escalateMod.escalateConversation as ReturnType<typeof vi.fn>;
const mockExecuteDataTool = aiData.executeDataTool as ReturnType<typeof vi.fn>;
const mockLoadTurnContext = loadContext.loadTurnContext as ReturnType<typeof vi.fn>;
const mockLoadMessages = loadContext.loadConversationMessages as ReturnType<typeof vi.fn>;
const mockLoadToolset = loadContext.loadDataToolset as ReturnType<typeof vi.fn>;
const mockLoadIsCustom = loadContext.loadIsCustomTenant as ReturnType<typeof vi.fn>;
const mockLoadSummary = loadContext.loadContextSummary as ReturnType<typeof vi.fn>;
const mockDbInsert = db.insert as ReturnType<typeof vi.fn>;

function eligibleCtx() {
  return {
    conversation: {
      id: "conv-1",
      organizationId: "org-1",
      applicationId: "app-1",
      status: "pending",
      handledBy: "ai" as string,
      assignedTo: null as string | null,
      createdBy: "visitor-1" as string | null,
      subject: "Help",
      createdAt: "2026-07-10T00:00:00.000Z",
    },
    organization: {
      id: "org-1",
      name: "Acme",
      plan: "ENTERPRISE",
      aiAddonActive: true as boolean,
    },
    application: {
      id: "app-1",
      aiEnabled: true,
      aiAutoRespond: true,
      aiDbEnabled: false,
    },
  };
}

const VISITOR_MSG = {
  authorType: "visitor",
  senderId: "visitor-1",
  content: "do you have the blue shirt in stock?",
  contentFormat: "plain",
  createdAt: "2026-07-10T00:01:00.000Z",
};

const httpToolset = {
  source: { kind: "http", config: { baseUrl: "https://x", allowedHost: "x" } },
  tools: [
    {
      id: "t1",
      name: "checkStock",
      description: "check stock by sku",
      backingType: "http",
      inputSchema: {
        type: "object",
        properties: { sku: { type: "string" } },
        required: ["sku"],
      },
      config: { method: "GET", urlTemplate: "https://x/{sku}" },
    },
  ],
};

function useProvider(): InstanceType<typeof MockProvider> {
  const provider = new MockProvider();
  mockCreateProvider.mockReturnValue(provider);
  return provider;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadTurnContext.mockResolvedValue(eligibleCtx());
  mockLoadMessages.mockResolvedValue([VISITOR_MSG]);
  mockLoadToolset.mockResolvedValue(null);
  mockLoadIsCustom.mockResolvedValue(false);
  mockLoadSummary.mockResolvedValue(undefined);
  mockCheckQuota.mockResolvedValue({ allowed: true });
  mockSendMessage.mockResolvedValue(undefined);
  mockEscalate.mockResolvedValue(undefined);
});

describe("runAiTurn — happy path", () => {
  it("persists a grounded AI answer and logs usage; no escalation", async () => {
    const provider = useProvider();
    provider.queueToolLoop({ toolCalls: [], text: "Yes, it's in stock." });

    await runAiTurn("conv-1");

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conv-1",
        senderId: null,
        authorType: "ai",
        content: "Yes, it's in stock.",
      }),
    );
    expect(mockEscalate).not.toHaveBeenCalled();
    // usage logged via runAICall
    expect(mockDbInsert).toHaveBeenCalled();
  });
});

describe("runAiTurn — escalation policy", () => {
  it("empty tool result → model escalates via tool → no fabricated AI message", async () => {
    mockLoadToolset.mockResolvedValue(httpToolset);
    mockExecuteDataTool.mockResolvedValue({ ok: true, data: [] });

    const provider = useProvider();
    provider.queueToolLoop({
      toolCalls: [
        { toolName: "checkStock", input: { sku: "X" } },
        { toolName: ESCALATE_TOOL_NAME, input: { reason: "no stock data returned" } },
      ],
      text: "",
    });

    await runAiTurn("conv-1");

    expect(mockExecuteDataTool).toHaveBeenCalledTimes(1);
    expect(mockEscalate).toHaveBeenCalledWith({
      conversation: expect.objectContaining({ id: "conv-1" }),
      reason: "no stock data returned",
      kind: "knowledge_gap",
    });
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("model calls escalateToHuman directly → knowledge_gap escalation", async () => {
    const provider = useProvider();
    provider.queueToolLoop({
      toolCalls: [{ toolName: ESCALATE_TOOL_NAME, input: { reason: "out of scope" } }],
      text: "",
    });

    await runAiTurn("conv-1");

    expect(mockEscalate).toHaveBeenCalledWith({
      conversation: expect.objectContaining({ id: "conv-1" }),
      reason: "out of scope",
      kind: "knowledge_gap",
    });
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("empty final text with no answer → knowledge_gap escalation (no dead air)", async () => {
    const provider = useProvider();
    provider.queueToolLoop({ toolCalls: [], text: "   " });

    await runAiTurn("conv-1");

    expect(mockEscalate).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "knowledge_gap", reason: "no_answer" }),
    );
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("provider throws → turn_failed escalation, never dead air", async () => {
    const provider = useProvider();
    provider.queueToolLoop({
      throwError: new AIProviderRateLimitError("rate limited"),
    });

    await runAiTurn("conv-1");

    expect(mockEscalate).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "turn_failed" }),
    );
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("pre-LLM human-request phrase → escalate without any provider call", async () => {
    mockLoadMessages.mockResolvedValue([
      { ...VISITOR_MSG, content: "please connect me with a human agent" },
    ]);

    await runAiTurn("conv-1");

    expect(mockCreateProvider).not.toHaveBeenCalled();
    expect(mockEscalate).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "human_requested", reason: "human_requested" }),
    );
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("quota exhausted → escalate before calling the provider", async () => {
    mockCheckQuota.mockResolvedValue({
      allowed: false,
      reason: "ai_monthly_cap_exceeded",
    });

    await runAiTurn("conv-1");

    expect(mockCreateProvider).not.toHaveBeenCalled();
    expect(mockEscalate).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "quota_exhausted" }),
    );
    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});

describe("runAiTurn — no-op guards", () => {
  it("does nothing when the conversation is human-handled", async () => {
    const ctx = eligibleCtx();
    ctx.conversation.handledBy = "human";
    mockLoadTurnContext.mockResolvedValue(ctx);

    await runAiTurn("conv-1");

    expect(mockCreateProvider).not.toHaveBeenCalled();
    expect(mockEscalate).not.toHaveBeenCalled();
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("does nothing when an operator is already assigned", async () => {
    const ctx = eligibleCtx();
    ctx.conversation.assignedTo = "op-1";
    mockLoadTurnContext.mockResolvedValue(ctx);

    await runAiTurn("conv-1");

    expect(mockCreateProvider).not.toHaveBeenCalled();
    expect(mockEscalate).not.toHaveBeenCalled();
  });

  it("does nothing when the org is not entitled (add-on inactive)", async () => {
    const ctx = eligibleCtx();
    ctx.organization.aiAddonActive = false;
    mockLoadTurnContext.mockResolvedValue(ctx);

    await runAiTurn("conv-1");

    expect(mockCreateProvider).not.toHaveBeenCalled();
    expect(mockEscalate).not.toHaveBeenCalled();
  });

  // Operator takeover (AC #5): `acceptConversation` flips handledBy→'human',
  // assignedTo→operator, status→'active' in one race-safe UPDATE (proven in
  // chat.service.test). After that, a re-triggered turn (e.g. from a still-in-
  // flight visitor message) must no-op. This holds for BOTH a chat that was
  // escalated first and a healthy AI chat an operator grabs mid-flow — the same
  // post-accept state, so one guard covers both.
  it("no-ops after an operator takeover (post-accept state: human + assigned + active)", async () => {
    const ctx = eligibleCtx();
    ctx.conversation.handledBy = "human";
    ctx.conversation.assignedTo = "operator-1";
    ctx.conversation.status = "active";
    mockLoadTurnContext.mockResolvedValue(ctx);

    await runAiTurn("conv-1");

    expect(mockCreateProvider).not.toHaveBeenCalled();
    expect(mockEscalate).not.toHaveBeenCalled();
    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});

describe("runAiTurn — per-conversation lock", () => {
  it("debounces a second concurrent turn (single provider call)", async () => {
    let resolveCtx!: (v: unknown) => void;
    mockLoadTurnContext.mockReturnValueOnce(
      new Promise((res) => {
        resolveCtx = res;
      }),
    );

    const provider = useProvider();
    provider.queueToolLoop({ toolCalls: [], text: "Answer." });

    const p1 = runAiTurn("conv-1");
    const p2 = runAiTurn("conv-1"); // lock held → returns immediately

    resolveCtx(eligibleCtx());
    await Promise.all([p1, p2]);

    expect(mockLoadTurnContext).toHaveBeenCalledTimes(1);
    expect(mockCreateProvider).toHaveBeenCalledTimes(1);
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
  });
});
