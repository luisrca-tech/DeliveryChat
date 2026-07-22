import { describe, it, expect, vi } from "vitest";

// The public router mounts plans (which imports env/stripe) alongside docs, so
// stub those out to import the real router wiring for the rate-limit check.
vi.mock("../../../lib/stripe.js", () => ({
  stripe: { prices: { retrieve: vi.fn().mockResolvedValue({}) } },
}));

vi.mock("../../../env.js", () => ({
  env: {
    STRIPE_BASIC_PRICE_KEY: "price_basic",
    STRIPE_PREMIUM_PRICE_KEY: "price_premium",
  },
}));

describe("publicRoute wiring", () => {
  it("applies the visitor rate limiter to docs endpoints", async () => {
    vi.resetModules();
    const { Hono } = await import("hono");
    const { publicRoute } = await import("../index.js");
    const app = new Hono().route("/public", publicRoute);

    // perSecond limit is 3 (VISITOR_RATE_LIMITS) → the 4th rapid request 429s.
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await app.request("/public/docs/pages");
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
    expect(statuses[3]).toBe(429);
  });
});
