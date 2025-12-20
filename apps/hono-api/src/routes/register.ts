import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { auth } from "../lib/auth.js";
import { registerSchema } from "./schemas/register.js";
import { jsonError, HTTP_STATUS, ERROR_MESSAGES } from "../lib/http.js";
import { APIError } from "better-auth/api";
import { db } from "../db/index.js";
import { user } from "../db/schema/users.js";
import { account } from "../db/schema/account.js";
import { session } from "../db/schema/session.js";
import { eq } from "drizzle-orm";
import { API_ERROR_STATUS_CODE_MAP } from "./constants/httpStatus.js";

function mapToHttpStatus(
  status: string | number
): (typeof HTTP_STATUS)[keyof typeof HTTP_STATUS] {
  const statusNum = typeof status === "string" ? parseInt(status, 10) : status;
  return (
    API_ERROR_STATUS_CODE_MAP[statusNum] ?? HTTP_STATUS.INTERNAL_SERVER_ERROR
  );
}

export const registerRoute = new Hono().post(
  "/register",
  zValidator("json", registerSchema),
  async (c) => {
    try {
      const { email, password, name, companyName, subdomain } =
        c.req.valid("json");

      let signUpResult;
      let signUpHeaders: Headers | undefined;
      try {
        const signUpResponse = await auth.api.signUpEmail({
          body: {
            email,
            password,
            name,
          },
          headers: c.req.raw.headers,
          returnHeaders: true,
        });

        signUpResult = signUpResponse.response;
        signUpHeaders = signUpResponse.headers;
      } catch (error) {
        if (error instanceof APIError) {
          return jsonError(
            c,
            mapToHttpStatus(error.status),
            "Failed to create account",
            error.message
          );
        }
        throw error;
      }

      if (!signUpResult?.user?.id) {
        return jsonError(
          c,
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
          "User creation failed"
        );
      }

      const userId = signUpResult.user.id;

      try {
        const orgHeaders = new Headers(c.req.raw.headers);
        if (signUpHeaders) {
          const setCookie = signUpHeaders.get("set-cookie");
          if (setCookie) {
            orgHeaders.set("cookie", setCookie);
          }
        }

        await auth.api.createOrganization({
          body: {
            name: companyName,
            slug: subdomain,
          },
          headers: orgHeaders,
        });
      } catch (error) {
        try {
          await db.transaction(async (tx) => {
            await tx.delete(account).where(eq(account.userId, userId));
            await tx.delete(session).where(eq(session.userId, userId));
            await tx.delete(user).where(eq(user.id, userId));
          });
        } catch {
          // Silently handle cleanup errors
        }

        if (error instanceof APIError) {
          return jsonError(
            c,
            mapToHttpStatus(error.status),
            "Failed to create organization",
            error.message
          );
        }
        throw error;
      }

      return c.json({
        success: true,
        user: signUpResult.user,
      });
    } catch (error) {
      return jsonError(
        c,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  }
);
