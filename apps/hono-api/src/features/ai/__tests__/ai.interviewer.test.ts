import { describe, it, expect, vi } from "vitest";

vi.mock("../../../env.js", () => ({
  env: {
    AI_MODEL: "mock://test",
    AI_INTERVIEW_MODEL: "mock://interview",
    GROQ_API_KEY: "test-key",
    AI_CONTEXT_MESSAGE_LIMIT: 10,
  },
}));

vi.mock("../../../db/index.js", () => ({
  db: { select: vi.fn(), insert: vi.fn(), transaction: vi.fn() },
}));

const { CORE_TOPICS, interviewerOutputSchema } = await import(
  "../ai.interviewer.js"
);

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
    const valid = {
      assistantMessage: "Tell me about your business.",
      intent: "ask" as const,
      topicsCoveredThisTurn: ["business_description"],
      guardrailAction: "none" as const,
    };
    expect(() => interviewerOutputSchema.parse(valid)).not.toThrow();
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

    expect(() =>
      interviewerOutputSchema.parse({
        assistantMessage: "hi",
        intent: "ask",
        topicsCoveredThisTurn: [],
        guardrailAction: "weird",
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
