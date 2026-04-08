import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { invitation } from "../db/schema/invitation.js";
import { organization } from "../db/schema/organization.js";
import { user } from "../db/schema/users.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../lib/http.js";

/**
 * Public invitation routes — no auth required.
 * Used by the accept-invitation page to fetch invitation details
 * before the invited user has signed up.
 */
export const invitationsRoute = new Hono().get("/:id", async (c) => {
  try {
    const invitationId = c.req.param("id");

    const [result] = await db
      .select({
        id: invitation.id,
        email: invitation.email,
        name: invitation.name,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        organizationName: organization.name,
        organizationSlug: organization.slug,
      })
      .from(invitation)
      .innerJoin(organization, eq(invitation.organizationId, organization.id))
      .where(eq(invitation.id, invitationId))
      .limit(1);

    if (!result) {
      return jsonError(
        c,
        HTTP_STATUS.NOT_FOUND,
        ERROR_MESSAGES.NOT_FOUND,
        "Invitation not found",
      );
    }

    // Check if user with this email already exists
    const [existingUser] = await db
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(eq(user.email, result.email))
      .limit(1);

    return c.json({
      invitation: result,
      existingUser: existingUser ? { name: existingUser.name } : null,
    });
  } catch (error) {
    console.error("Error fetching invitation:", error);
    return jsonError(
      c,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
    );
  }
});
