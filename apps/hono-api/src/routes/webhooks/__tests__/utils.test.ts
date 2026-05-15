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

import { extractPlanFromMetadata, formatMoney } from "../utils.js";

describe("extractPlanFromMetadata", () => {
  it("returns valid plan from metadata", () => {
    expect(extractPlanFromMetadata({ plan: "BASIC" })).toBe("BASIC");
    expect(extractPlanFromMetadata({ plan: "PREMIUM" })).toBe("PREMIUM");
    expect(extractPlanFromMetadata({ plan: "ENTERPRISE" })).toBe("ENTERPRISE");
  });

  it("returns null for invalid plan", () => {
    expect(extractPlanFromMetadata({ plan: "INVALID" })).toBeNull();
    expect(extractPlanFromMetadata({ plan: "FREE" })).toBeNull();
  });

  it("returns null for missing metadata", () => {
    expect(extractPlanFromMetadata(null)).toBeNull();
    expect(extractPlanFromMetadata(undefined)).toBeNull();
    expect(extractPlanFromMetadata({})).toBeNull();
  });
});

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
