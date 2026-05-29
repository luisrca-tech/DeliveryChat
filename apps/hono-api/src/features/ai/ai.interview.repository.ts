import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { applicationAiContext } from "../../db/schema/applicationAiContext.js";
import type {
  AdvanceDecision,
  BootstrapPersistDecision,
  ForcedCompletionDecision,
} from "./ai.interview.engine.js";
import type { InterviewContextRow } from "./ai.interview.schema.js";

type Executor = typeof db;

export class InterviewRepository {
  constructor(private readonly executor: Executor) {}

  async loadOrInit(applicationId: string): Promise<InterviewContextRow> {
    const existing = await this.executor
      .select()
      .from(applicationAiContext)
      .where(eq(applicationAiContext.applicationId, applicationId))
      .limit(1);

    if (existing[0]) {
      return existing[0] as InterviewContextRow;
    }

    const [created] = await this.executor
      .insert(applicationAiContext)
      .values({ applicationId })
      .returning();

    return created as InterviewContextRow;
  }

  async loadByApplicationId(
    applicationId: string,
  ): Promise<InterviewContextRow | null> {
    const rows = await this.executor
      .select()
      .from(applicationAiContext)
      .where(eq(applicationAiContext.applicationId, applicationId))
      .limit(1);
    return (rows[0] as InterviewContextRow | undefined) ?? null;
  }

  async applyBootstrap(
    rowId: string,
    decision: BootstrapPersistDecision,
  ): Promise<InterviewContextRow> {
    const [updated] = await this.executor
      .update(applicationAiContext)
      .set({ interviewLog: decision.nextLog })
      .where(eq(applicationAiContext.id, rowId))
      .returning();
    return updated as InterviewContextRow;
  }

  async applyAdvance(
    rowId: string,
    decision: AdvanceDecision,
  ): Promise<InterviewContextRow> {
    const [updated] = await this.executor
      .update(applicationAiContext)
      .set({
        interviewLog: decision.nextLog,
        currentTurn: decision.nextTurn,
      })
      .where(eq(applicationAiContext.id, rowId))
      .returning();
    return updated as InterviewContextRow;
  }

  async applyForcedCompletion(
    rowId: string,
    userId: string,
    decision: ForcedCompletionDecision,
  ): Promise<InterviewContextRow> {
    const [updated] = await this.executor
      .update(applicationAiContext)
      .set({
        interviewLog: decision.nextLog,
        status: "completed",
        completedBy: userId,
        completedAt: decision.completedAt,
      })
      .where(eq(applicationAiContext.id, rowId))
      .returning();
    return updated as InterviewContextRow;
  }

  async applyContextSummary(
    rowId: string,
    contextSummary: string,
  ): Promise<InterviewContextRow> {
    const [updated] = await this.executor
      .update(applicationAiContext)
      .set({ contextSummary })
      .where(eq(applicationAiContext.id, rowId))
      .returning();
    return updated as InterviewContextRow;
  }

  async markCompleted(
    rowId: string,
    userId: string,
    completedAt: string,
  ): Promise<InterviewContextRow> {
    const [updated] = await this.executor
      .update(applicationAiContext)
      .set({ status: "completed", completedBy: userId, completedAt })
      .where(eq(applicationAiContext.id, rowId))
      .returning();
    return updated as InterviewContextRow;
  }
}

export function createInterviewRepository(executor: Executor): InterviewRepository {
  return new InterviewRepository(executor);
}
