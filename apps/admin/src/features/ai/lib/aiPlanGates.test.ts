import { describe, it, expect } from "vitest";
import {
  planAllowsServing,
  planAllowsAddon,
  resolveAiLock,
} from "./aiPlanGates";

describe("planAllowsServing", () => {
  it.each([
    ["BASIC", true],
    ["PREMIUM", true],
    ["ENTERPRISE", true],
    ["FREE", false],
    [null, false],
    [undefined, false],
    ["", false],
  ])("plan %s → %s", (plan, expected) => {
    expect(planAllowsServing(plan)).toBe(expected);
  });
});

describe("planAllowsAddon", () => {
  it.each([
    ["PREMIUM", true],
    ["ENTERPRISE", true],
    ["BASIC", false],
    ["FREE", false],
    [null, false],
    [undefined, false],
    ["", false],
  ])("plan %s → %s", (plan, expected) => {
    expect(planAllowsAddon(plan)).toBe(expected);
  });

  it("is strictly narrower than serving: BASIC may be served but may not hold the add-on", () => {
    expect(planAllowsServing("BASIC")).toBe(true);
    expect(planAllowsAddon("BASIC")).toBe(false);
  });
});

describe("resolveAiLock", () => {
  it.each([
    ["FREE", false, "free_plan"],
    ["FREE", true, "free_plan"],
    [null, false, "free_plan"],
    ["BASIC", false, "upgrade_plan"],
    ["PREMIUM", false, "addon_inactive"],
    ["ENTERPRISE", false, "addon_inactive"],
    ["PREMIUM", true, null],
    ["ENTERPRISE", true, null],
  ])("plan %s, add-on active %s → %s", (plan, addonActive, expected) => {
    expect(resolveAiLock(plan, addonActive as boolean)).toBe(expected);
  });

  it("locks an eligible plan again once the add-on is cancelled", () => {
    expect(resolveAiLock("PREMIUM", true)).toBeNull();
    expect(resolveAiLock("PREMIUM", false)).toBe("addon_inactive");
  });

  it("never reports addon_inactive for a plan that could not buy it anyway", () => {
    // BASIC with a stale aiAddonActive=true must still read as a plan problem,
    // not as a purchase problem — it has nothing to purchase.
    expect(resolveAiLock("BASIC", true)).toBe("upgrade_plan");
  });
});
