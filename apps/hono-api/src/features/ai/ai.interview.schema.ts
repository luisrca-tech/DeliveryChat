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

export const interviewerOutputSchema = z.object({
  assistantMessage: z.string().min(1),
  intent: z.enum(["ask", "suggest_finish", "final_question"]),
  topicsCoveredThisTurn: z.array(z.string()).default([]),
  guardrailAction: z.enum([
    "none",
    "redirect_scope",
    "block_extraction",
    "pushback_garbage",
    "accept_garbage",
  ]),
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
  intent?: "final_question";
};

export type InterviewContextRow = {
  id: string;
  applicationId: string;
  status: "in_progress" | "completed";
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
  for (const entry of log) {
    if (entry.role !== "assistant") continue;
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
