import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { conversations } from "../../db/schema/conversations.js";

/**
 * Cheap gate + fire-and-forget kick-off for an autonomous AI turn.
 *
 * Called from `sendMessage` after a VISITOR message is persisted. It does a
 * single indexed lookup to confirm the conversation is AI-handled and still
 * unassigned/open before spawning `runAiTurn`. `runAiTurn` is imported lazily to
 * avoid a load-time cycle (it imports `sendMessage` to persist the AI reply) and
 * owns all further error handling — the `.catch` here is belt-and-braces.
 */
export async function maybeTriggerAiTurn(conversationId: string): Promise<void> {
  try {
    const [row] = await db
      .select({
        handledBy: conversations.handledBy,
        assignedTo: conversations.assignedTo,
        status: conversations.status,
      })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    if (
      !row ||
      row.handledBy !== "ai" ||
      row.assignedTo !== null ||
      row.status === "closed"
    ) {
      return;
    }

    const { runAiTurn } = await import("./runAiTurn.js");
    void runAiTurn(conversationId).catch((err) => {
      console.error("[ai-turn] runAiTurn rejected unexpectedly", conversationId, err);
    });
  } catch (err) {
    console.error("[ai-turn] maybeTriggerAiTurn failed", conversationId, err);
  }
}
