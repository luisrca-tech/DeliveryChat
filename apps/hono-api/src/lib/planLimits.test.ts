import { describe, it, expect } from "vitest";
import { getAiLimitsByPlan, planAllowsServing } from "./planLimits.js";

describe("getAiLimitsByPlan", () => {
  it("lets FREE author an interview but never serve AI", () => {
    const limits = getAiLimitsByPlan("FREE");
    expect(limits.aiInterviewEnabled).toBe(true);
    expect(limits.aiAssistantEnabled).toBe(false);
    expect(limits.aiMonthlyCap).toBe(0);
  });

  it("gives BASIC both the interview and the assistant, capped at 1000", () => {
    const limits = getAiLimitsByPlan("BASIC");
    expect(limits.aiInterviewEnabled).toBe(true);
    expect(limits.aiAssistantEnabled).toBe(true);
    expect(limits.aiMonthlyCap).toBe(1000);
  });

  it("keeps PREMIUM and ENTERPRISE at 3000", () => {
    for (const plan of ["PREMIUM", "ENTERPRISE"]) {
      const limits = getAiLimitsByPlan(plan);
      expect(limits.aiInterviewEnabled).toBe(true);
      expect(limits.aiAssistantEnabled).toBe(true);
      expect(limits.aiMonthlyCap).toBe(3000);
    }
  });

  it("falls back to FREE for an unknown plan", () => {
    expect(getAiLimitsByPlan("BOGUS")).toEqual(getAiLimitsByPlan("FREE"));
  });
});

describe("planAllowsServing", () => {
  it("is false only for FREE and unknown plans", () => {
    expect(planAllowsServing("FREE")).toBe(false);
    expect(planAllowsServing("BOGUS")).toBe(false);
    expect(planAllowsServing(null)).toBe(false);
    expect(planAllowsServing("BASIC")).toBe(true);
    expect(planAllowsServing("PREMIUM")).toBe(true);
    expect(planAllowsServing("ENTERPRISE")).toBe(true);
  });
});
