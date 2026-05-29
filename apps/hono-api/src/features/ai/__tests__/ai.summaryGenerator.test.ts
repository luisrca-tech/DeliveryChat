import { describe, it, expect, vi, beforeEach } from "vitest";
import type { InterviewLogEntry } from "../ai.interview.schema.js";
import type { AIProvider, AIProviderRequest } from "../ai.provider.js";

vi.mock("../../../env.js", () => ({
  env: {
    AI_MODEL: "mock://test",
    AI_INTERVIEW_MODEL: "mock://interview",
    GROQ_API_KEY: "test-key",
    AI_CONTEXT_MESSAGE_LIMIT: 10,
  },
}));

const usageLogInserts: unknown[] = [];

vi.mock("../../../db/schema/aiUsageLog.js", () => ({
  aiUsageLog: { __table: "ai_usage_log" },
}));

vi.mock("../../../db/index.js", () => ({
  db: {
    insert: vi.fn(() => ({
      values: async (values: unknown) => {
        usageLogInserts.push(values);
        return [];
      },
    })),
  },
}));

const { generateInterviewSummary, SUMMARY_SYSTEM_PROMPT } = await import(
  "../ai.summaryGenerator.js"
);
const { AIEmptyResponseError } = await import("../ai.errors.js");
const { INTERVIEW_MODEL } = await import("../ai.prompts.interview.js");

const TENANT_ID = "tenant-1";
const USER_ID = "user-1";

function makeProvider(text: string) {
  const generateText = vi.fn(async (_req: AIProviderRequest) => ({
    text,
    usage: { promptTokens: 10, completionTokens: 20 },
    finishReason: "stop",
  }));
  const generateObject = vi.fn();
  const provider: AIProvider = {
    generateText: generateText as unknown as AIProvider["generateText"],
    generateObject: generateObject as unknown as AIProvider["generateObject"],
  };
  return { provider, generateText };
}

const SAMPLE_LOG: InterviewLogEntry[] = [
  {
    role: "assistant",
    content: "What does your business do?",
    topicsCoveredThisTurn: ["business_description"],
  },
  {
    role: "user",
    content: "We deliver groceries from local stores within 30 minutes.",
  },
  {
    role: "assistant",
    content: "Who are your customers?",
    topicsCoveredThisTurn: ["target_audience"],
  },
  { role: "user", content: "Busy urban professionals aged 25–45." },
];

const VALID_SUMMARY = `# Application Context

## Business
Local grocery delivery in 30 minutes.

## Audience
Urban professionals 25–45.

## Products & Services
Same-day grocery delivery.

## Tone
Friendly and concise.

## Common Scenarios
Order tracking, missing items, refund requests.

## Prohibited Topics
Medical advice, legal counsel.

## Drafting Guidance
- Acknowledge issues without confirming account details.
- Never promise refund timelines.
- Keep replies under three sentences.`;

describe("ai.summaryGenerator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usageLogInserts.length = 0;
  });

  describe("system prompt", () => {
    it("mandates the six topical sections plus Drafting Guidance", () => {
      expect(SUMMARY_SYSTEM_PROMPT).toMatch(/Business/);
      expect(SUMMARY_SYSTEM_PROMPT).toMatch(/Audience/);
      expect(SUMMARY_SYSTEM_PROMPT).toMatch(/Products & Services/);
      expect(SUMMARY_SYSTEM_PROMPT).toMatch(/Tone/);
      expect(SUMMARY_SYSTEM_PROMPT).toMatch(/Common Scenarios/);
      expect(SUMMARY_SYSTEM_PROMPT).toMatch(/Prohibited Topics/);
      expect(SUMMARY_SYSTEM_PROMPT).toMatch(/Drafting Guidance/);
      expect(SUMMARY_SYSTEM_PROMPT).toMatch(/2[–-]4/);
    });
  });

  describe("prompt assembly", () => {
    it("includes the application name and the full interview log in the user message", async () => {
      const { provider, generateText } = makeProvider(VALID_SUMMARY);

      await generateInterviewSummary({
        provider,
        tenantId: TENANT_ID,
        userId: USER_ID,
        applicationName: "Quick Grocer",
        interviewLog: SAMPLE_LOG,
      });

      expect(generateText).toHaveBeenCalledTimes(1);
      const req = generateText.mock.calls[0]![0] as AIProviderRequest;
      expect(req.model).toBe(INTERVIEW_MODEL);
      expect(req.systemPrompt).toBe(SUMMARY_SYSTEM_PROMPT);
      expect(req.messages).toHaveLength(1);
      expect(req.messages[0]!.role).toBe("user");
      expect(req.messages[0]!.content).toContain("Quick Grocer");
      expect(req.messages[0]!.content).toContain(
        "We deliver groceries from local stores within 30 minutes.",
      );
      expect(req.messages[0]!.content).toContain(
        "Busy urban professionals aged 25–45.",
      );
    });

    it("forwards the abort signal to the provider", async () => {
      const { provider, generateText } = makeProvider(VALID_SUMMARY);
      const controller = new AbortController();

      await generateInterviewSummary({
        provider,
        tenantId: TENANT_ID,
        userId: USER_ID,
        applicationName: "Quick Grocer",
        interviewLog: SAMPLE_LOG,
        abortSignal: controller.signal,
      });

      const req = generateText.mock.calls[0]![0] as AIProviderRequest;
      expect(req.abortSignal).toBe(controller.signal);
    });
  });

  describe("happy path", () => {
    it("returns the sanitized markdown summary", async () => {
      const { provider } = makeProvider(VALID_SUMMARY);

      const result = await generateInterviewSummary({
        provider,
        tenantId: TENANT_ID,
        userId: USER_ID,
        applicationName: "Quick Grocer",
        interviewLog: SAMPLE_LOG,
      });

      expect(typeof result).toBe("string");
      expect(result).toContain("# Application Context");
      expect(result).toContain("Drafting Guidance");
    });

    it("runs the AI sanitizer (strips HTML and fenced code wrappers)", async () => {
      const dirty = `<script>alert('x')</script>
\`\`\`markdown
${VALID_SUMMARY}
\`\`\``;
      const { provider } = makeProvider(dirty);

      const result = await generateInterviewSummary({
        provider,
        tenantId: TENANT_ID,
        userId: USER_ID,
        applicationName: "Quick Grocer",
        interviewLog: SAMPLE_LOG,
      });

      expect(result).not.toContain("<script>");
      expect(result).not.toContain("```");
      expect(result).toContain("# Application Context");
    });

    it("writes a successful interview_summary aiUsageLog row", async () => {
      const { provider } = makeProvider(VALID_SUMMARY);

      await generateInterviewSummary({
        provider,
        tenantId: TENANT_ID,
        userId: USER_ID,
        applicationName: "Quick Grocer",
        interviewLog: SAMPLE_LOG,
      });

      expect(usageLogInserts).toHaveLength(1);
      expect(usageLogInserts[0]).toMatchObject({
        action: "interview_summary",
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: null,
        status: "success",
        inputTokens: 10,
        outputTokens: 20,
        finishReason: "stop",
      });
    });
  });

  describe("validation", () => {
    it("rejects empty output with AIEmptyResponseError and logs an empty row", async () => {
      const { provider } = makeProvider("   \n  ");

      await expect(
        generateInterviewSummary({
          provider,
          tenantId: TENANT_ID,
          userId: USER_ID,
          applicationName: "Quick Grocer",
          interviewLog: SAMPLE_LOG,
        }),
      ).rejects.toBeInstanceOf(AIEmptyResponseError);

      expect(usageLogInserts).toHaveLength(1);
      expect(usageLogInserts[0]).toMatchObject({
        action: "interview_summary",
        status: "empty",
      });
    });

    it("rejects output exceeding the size cap", async () => {
      const oversize = "a".repeat(8001);
      const { provider } = makeProvider(oversize);

      await expect(
        generateInterviewSummary({
          provider,
          tenantId: TENANT_ID,
          userId: USER_ID,
          applicationName: "Quick Grocer",
          interviewLog: SAMPLE_LOG,
        }),
      ).rejects.toThrow(/too large|oversize|exceeds/i);
    });
  });
});
