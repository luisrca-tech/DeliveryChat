import { Hono } from "hono";

/**
 * Shared Hono instance for API routes
 * This ensures consistent configuration across all routes
 */
export const api = new Hono();
