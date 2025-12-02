import { Hono } from "hono";
import { usersRoute } from "../routes/users";
import { companiesRoute } from "../routes/companies";

/**
 * Shared Hono instance for API routes
 * Routes are composed using .route() to ensure proper TypeScript inference for RPC
 * Following Hono RPC pattern for larger applications: https://hono.dev/docs/guides/rpc
 */
const app = new Hono().route("/", usersRoute).route("/", companiesRoute);

export const api = app;
export type APIType = typeof app;
