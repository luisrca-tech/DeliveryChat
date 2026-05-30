export type AiInterviewStatus = "not_started" | "in_progress" | "completed";

export type InterviewSummaryStatus = "none" | "pending" | "ready" | "failed";

export type InterviewLogEntry = {
  role: "assistant" | "user";
  content: string;
  topicsCoveredThisTurn?: string[];
  garbagePushbackTopics?: string[];
  intent?: "final_question";
};

export type InterviewStateNotStarted = {
  status: "not_started";
};

export type InterviewStateActive = {
  status: "in_progress" | "completed";
  summaryStatus: InterviewSummaryStatus;
  currentTurn: number;
  interviewLog: InterviewLogEntry[];
  contextSummary?: string | null;
  completedBy?: string | null;
  completedByName?: string | null;
  completedAt?: string | null;
};

export type InterviewState = InterviewStateNotStarted | InterviewStateActive;

export type InterviewCompleteResponse = {
  status: "completed";
  summaryStatus: InterviewSummaryStatus;
  currentTurn: number;
  completedBy: string | null;
  completedAt: string | null;
};

export type InterviewGenerateSummaryResponse = {
  status: "completed";
  summaryStatus: InterviewSummaryStatus;
  contextSummary: string | null;
  aiEnabled: boolean;
};

export type InterviewTurnResponse = {
  status: "in_progress" | "completed";
  currentTurn: number;
  interviewLog: InterviewLogEntry[];
  canFinish: boolean;
  turn: {
    intent: "ask" | "suggest_finish" | "final_question";
    topicsCoveredThisTurn: string[];
    guardrailAction:
      | "none"
      | "redirect_scope"
      | "block_extraction"
      | "pushback_garbage"
      | "accept_garbage";
  };
};
