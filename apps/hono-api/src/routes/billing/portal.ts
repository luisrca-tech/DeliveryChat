import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { organization as organizationTable } from "../../db/schema/organization.js";
import { user as userTable } from "../../db/schema/users.js";
import { getTenantAuth, requireRole } from "../../lib/middleware/auth.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../../lib/http.js";
import { getUserAdminUrl } from "../../lib/auth.js";
import { stripe } from "../../lib/stripe.js";

export const portalRoute = new Hono().post(
  "/portal-session",
  requireRole("super_admin"),
  async (c) => {
    try {
      const auth = getTenantAuth(c);
      const { organization } = auth;

      let stripeCustomerId = organization.stripeCustomerId ?? null;

      if (!stripeCustomerId) {
        const [dbUser] = await db
          .select({ email: userTable.email, name: userTable.name })
          .from(userTable)
          .where(eq(userTable.id, auth.user.id))
          .limit(1);

        if (!dbUser) {
          return jsonError(
            c,
            HTTP_STATUS.UNAUTHORIZED,
            ERROR_MESSAGES.UNAUTHORIZED,
          );
        }

        const customer = await stripe.customers.create({
          email: organization.billingEmail ?? dbUser.email,
          name: organization.name,
          metadata: {
            organizationId: organization.id,
            organizationSlug: organization.slug,
          },
        });

        stripeCustomerId = customer.id;

        await db
          .update(organizationTable)
          .set({
            stripeCustomerId,
            billingEmail: organization.billingEmail ?? dbUser.email,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(organizationTable.id, organization.id));
      }

      const adminBaseUrl = await getUserAdminUrl(
        auth.user.id,
        c.req.raw.headers,
      );

      const session = await stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: `${adminBaseUrl}/settings/billing`,
      });

      return c.json({ url: session.url });
    } catch (error) {
      console.error("Error creating billing portal session:", error);
      return jsonError(
        c,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  },
);
