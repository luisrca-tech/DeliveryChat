import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { applications } from "../../db/schema/applications.js";
import { organization } from "../../db/schema/organization.js";
import { isAiTurnEntitled } from "./entitlement.js";

/**
 * Decide the initial `handledBy` mode for a newly created visitor conversation.
 *
 * Returns `'ai'` only when the application opted into auto-responding AND the
 * org/application entitlement holds; otherwise `'human'`. This is the single
 * place that makes the AI-first-vs-human-first decision at creation time.
 */
export async function resolveInitialHandledBy(
  applicationId: string,
): Promise<"ai" | "human"> {
  const [row] = await db
    .select({
      aiEnabled: applications.aiEnabled,
      aiAutoRespond: applications.aiAutoRespond,
      plan: organization.plan,
      aiAddonActive: organization.aiAddonActive,
    })
    .from(applications)
    .innerJoin(organization, eq(organization.id, applications.organizationId))
    .where(eq(applications.id, applicationId))
    .limit(1);

  if (!row) return "human";

  return isAiTurnEntitled({
    organization: { plan: row.plan, aiAddonActive: row.aiAddonActive },
    application: { aiEnabled: row.aiEnabled, aiAutoRespond: row.aiAutoRespond },
  })
    ? "ai"
    : "human";
}
