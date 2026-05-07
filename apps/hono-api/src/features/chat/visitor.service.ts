import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { user } from "../../db/schema/users.js";

export const ANONYMOUS_EMAIL_DOMAIN = "anonymous.deliverychat.online";
export const DEFAULT_VISITOR_NAME = "Visitor";

export async function resolveOrCreateVisitor(
  visitorId: string,
): Promise<string> {
  const [existingUser] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, visitorId))
    .limit(1);

  if (existingUser) return existingUser.id;

  await db
    .insert(user)
    .values({
      id: visitorId,
      name: DEFAULT_VISITOR_NAME,
      email: `${visitorId}@${ANONYMOUS_EMAIL_DOMAIN}`,
      isAnonymous: true,
      status: "ACTIVE",
    })
    .onConflictDoNothing();

  return visitorId;
}
