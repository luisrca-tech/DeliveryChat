import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../db/index.js", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock("../../../env.js", () => ({
  env: {
    AI_MODEL: "mock://test",
    GROQ_API_KEY: "test-key",
    AI_CONTEXT_MESSAGE_LIMIT: 10,
  },
}));

vi.mock("../ai.groqProvider.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ai.groqProvider.js")>();
  return {
    ...actual,
    createAIProvider: vi.fn(),
  };
});

const { db } = await import("../../../db/index.js");
const { createAIProvider } = await import("../ai.groqProvider.js");

const mockSelect = db.select as ReturnType<typeof vi.fn>;
const mockInsert = db.insert as ReturnType<typeof vi.fn>;
const mockCreateAIProvider = createAIProvider as ReturnType<typeof vi.fn>;

function chainMock(result: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of [
    "from",
    "where",
    "innerJoin",
    "leftJoin",
    "orderBy",
    "limit",
    "offset",
    "values",
    "set",
  ]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

function mockInsertChain() {
  const chain: Record<string, unknown> = {};
  chain.values = vi.fn(() => chain);
  chain.then = (resolve: (v: unknown) => void) =>
    Promise.resolve(undefined).then(resolve);
  return chain;
}

const { generateReply } = await import("../ai.service.js");

const OWNERSHIP_WITH_APP = [{ id: "conv-1", applicationId: "app-1" }];
const VISITOR_MESSAGES = [
  {
    senderId: "visitor-1",
    content: "Question from visitor",
    contentFormat: "plain",
    createdAt: "2026-05-25T11:55:00Z",
  },
];

type Brief = {
  name: string;
  tenantName: string;
  contextSummary: string;
  keywords: string[];
};

const BRIEFS: Brief[] = [
  {
    name: "Hortifruti",
    tenantName: "Hortifruti",
    contextSummary: [
      "Hortifruti delivers same-day organic produce in São Paulo's Zona Sul.",
      "Subscription boxes priced R$ 89, R$ 149, R$ 219 per week, plus an 18% marketplace fee on à la carte items.",
      "Delivery windows are 2 hours from 4 regional hubs.",
      "Audience: urban families (28-48yo) and small farmers (15-50 hectare operations).",
      "Tone: warm, concrete, lead with empathy on late deliveries.",
      "Prohibited topics: nutritional or weight-loss advice tied to specific produce.",
    ].join("\n"),
    keywords: [
      "R$ 89",
      "Delivery windows",
      "nutritional or weight-loss advice",
    ],
  },
  {
    name: "FlagPilot",
    tenantName: "FlagPilot",
    contextSummary: [
      "FlagPilot is a feature-flag and gradual-rollout service for solo founders and 2–5 person teams.",
      "Pricing: Free up to 3 flags / 10k MAU; Pro $19/mo unlimited; Team $49/mo with audit log.",
      "Core features: flag CRUD, percentage rollouts, segment targeting, SDKs for Node/Python/Go.",
      "Tone: terse, technical, no-fluff.",
      "Prohibited topics: enterprise sales pitches, comparisons that disparage competitors.",
    ].join("\n"),
    keywords: ["$19/mo", "percentage rollouts", "no-fluff"],
  },
  {
    name: "Verbose Founder",
    tenantName: "Hortifruti",
    contextSummary: [
      "Hortifruti delivers same-day organic produce in São Paulo's Zona Sul.",
      "Audience now includes a restaurant-buyer segment in the Moema B2B pilot; they expect invoice-style receipts and bulk CSV exports.",
      "Tone: on late deliveries, lead with empathy and a concrete next step (re-delivery window, refund, credit) before any policy language.",
      "Prohibited topics: nutritional or weight-loss advice tied to specific produce items.",
    ].join("\n"),
    keywords: [
      "restaurant-buyer segment",
      "lead with empathy",
      "nutritional or weight-loss advice",
    ],
  },
];

describe("generateReply contextSummary plumbing (per brief)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  for (const brief of BRIEFS) {
    it(`[${brief.name}] passes contextSummary into the system prompt with brief keywords`, async () => {
      mockSelect
        .mockReturnValueOnce(chainMock(OWNERSHIP_WITH_APP))
        .mockReturnValueOnce(chainMock(VISITOR_MESSAGES))
        .mockReturnValueOnce(
          chainMock([
            { aiEnabled: true, contextSummary: brief.contextSummary },
          ]),
        );
      mockInsert.mockReturnValue(mockInsertChain());

      const mockProvider = {
        generateText: vi.fn().mockResolvedValue({
          text: "Mocked reply",
          usage: { promptTokens: 50, completionTokens: 10 },
          finishReason: "stop",
        }),
      };
      mockCreateAIProvider.mockReturnValue(mockProvider);

      await generateReply({
        conversationId: "conv-1",
        operatorId: "op-1",
        tenantId: "tenant-1",
        tenantName: brief.tenantName,
      });

      expect(mockProvider.generateText).toHaveBeenCalledOnce();
      const callArgs = mockProvider.generateText.mock.calls[0]![0];
      const systemPrompt: string = callArgs.systemPrompt;

      expect(systemPrompt).toContain("[Application Context]");
      expect(systemPrompt).toContain(brief.contextSummary);
      for (const keyword of brief.keywords) {
        expect(systemPrompt).toContain(keyword);
      }
    });
  }
});
