import { describe, it, expect, vi } from "vitest";

vi.mock("../../../db/index.js", () => ({
  db: { insert: vi.fn(), delete: vi.fn() },
}));

vi.mock("../../../db/schema/processedEvents.js", () => ({
  processedEvents: { id: "id" },
}));

vi.mock("../../../env.js", () => ({
  env: { SIGNING_STRIPE_SECRET_KEY: "whsec_test" },
}));

vi.mock("../../../lib/stripe.js", () => ({
  stripe: { webhooks: { constructEvent: vi.fn() } },
}));

// Plan resolution (price-first, metadata fallback) now lives in
// `lib/stripePlan.ts` and is covered by `lib/__tests__/stripePlan.test.ts`.
import { formatMoney } from "../utils.js";

describe("formatMoney", () => {
  it("converts cents to dollar string", () => {
    expect(formatMoney(2900)).toBe("29.00");
    expect(formatMoney(100)).toBe("1.00");
    expect(formatMoney(0)).toBe("0.00");
    expect(formatMoney(1999)).toBe("19.99");
  });

  it("returns null for invalid values", () => {
    expect(formatMoney(null)).toBeNull();
    expect(formatMoney(undefined)).toBeNull();
    expect(formatMoney(Infinity)).toBeNull();
    expect(formatMoney(NaN)).toBeNull();
  });
});
