import { z } from "zod";

export const CORE_TOPICS = [
  "business_description",
  "target_audience",
  "products_services",
  "preferred_tone",
  "common_support_scenarios",
  "prohibited_topics",
] as const;

export type CoreTopic = (typeof CORE_TOPICS)[number];

export const extraContextRelevanceSchema = z.enum([
  "relevant",
  "irrelevant",
  "duplicate",
]);

export type ExtraContextRelevance = z.infer<typeof extraContextRelevanceSchema>;

export const interviewerOutputSchema = z.object({
  assistantMessage: z.string().min(1),
  intent: z.enum(["ask", "suggest_finish", "final_question"]),
  topicsCoveredThisTurn: z.array(z.string()),
  guardrailAction: z.enum([
    "none",
    "redirect_scope",
    "block_extraction",
    "pushback_garbage",
    "accept_garbage",
  ]),
  extraContextRelevance: extraContextRelevanceSchema.optional(),
  followUpQuestion: z.boolean().optional(),
});

export type InterviewerOutput = z.infer<typeof interviewerOutputSchema>;

export type GuardRailAction = InterviewerOutput["guardrailAction"];

export type EngineMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type InterviewLogEntry = {
  role: "assistant" | "user";
  content: string;
  topicsCoveredThisTurn?: string[];
  garbagePushbackTopics?: string[];
  intent?: "final_question" | "suggest_finish";
  extraContextRelevance?: ExtraContextRelevance;
  followUpQuestion?: boolean;
};

export type SummaryStatus = "none" | "pending" | "ready" | "failed";

export function deriveBackfilledSummaryStatus(row: {
  status: "in_progress" | "completed";
  contextSummary: string | null;
}): SummaryStatus {
  if (row.status !== "completed") return "none";
  return row.contextSummary != null ? "ready" : "pending";
}

export type InterviewContextRow = {
  id: string;
  applicationId: string;
  status: "in_progress" | "completed";
  summaryStatus: SummaryStatus;
  interviewLog: InterviewLogEntry[];
  currentTurn: number;
  contextSummary: string | null;
  completedBy: string | null;
  completedAt: string | null;
};

export const MAX_TURNS = 15;
export const FORCED_COMPLETION_FINISH_REASON = "forced_cap_completion";

const CORE_TOPIC_SET = new Set<string>(CORE_TOPICS);

export function computeCoveredTopics(
  log: InterviewLogEntry[],
): Set<CoreTopic> {
  const covered = new Set<CoreTopic>();
  for (let i = 0; i < log.length; i++) {
    const entry = log[i];
    if (entry?.role !== "assistant") continue;
    const hasUserResponseAfter = log
      .slice(i + 1)
      .some((e) => e.role === "user");
    if (!hasUserResponseAfter) continue;
    const topics = entry.topicsCoveredThisTurn ?? [];
    for (const topic of topics) {
      if (CORE_TOPIC_SET.has(topic)) {
        covered.add(topic as CoreTopic);
      } else {
        console.warn("[ai.interviewer] ignoring unknown topic key:", topic);
      }
    }
  }
  return covered;
}

export function missingTopics(covered: Set<CoreTopic>): CoreTopic[] {
  return CORE_TOPICS.filter((t) => !covered.has(t));
}

// Coverage perspectives — explicit names for the same underlying computation,
// chosen by where in the turn lifecycle it is asked.
//
// Coverage is credited only to assistant turns that received a user reply
// afterwards. Each variant differs in what "the log" means at the moment of
// the question:
//
// - coverageOfLog: the log as currently persisted. Use for bootstrap inspection
//   and final completion validation, where no pending user reply is implied.
// - coverageAfterAdminReply: the log plus a pending user message that has not
//   been persisted yet. Use during an in-flight turn to ask "if we accepted
//   this reply, would the prior assistant question count as covered?".
export function coverageOfLog(log: InterviewLogEntry[]): Set<CoreTopic> {
  return computeCoveredTopics(log);
}

export function coverageAfterAdminReply(
  log: InterviewLogEntry[],
  pendingUserMessage: string,
): Set<CoreTopic> {
  return computeCoveredTopics([
    ...log,
    { role: "user", content: pendingUserMessage },
  ]);
}
