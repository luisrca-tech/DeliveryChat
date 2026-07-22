import { describe, it, expect } from "vitest";
import { tryAcquireTurnLock, releaseTurnLock } from "../lock.js";

// The lock module holds module-level state; each test uses a unique
// conversation id so tests stay independent without resetting modules.

describe("turn lock", () => {
  it("acquires a free lock and blocks a second concurrent acquire", () => {
    expect(tryAcquireTurnLock("lock-a")).toBe(true);
    expect(tryAcquireTurnLock("lock-a")).toBe(false);
    releaseTurnLock("lock-a");
  });

  it("locks are per conversation", () => {
    expect(tryAcquireTurnLock("lock-b")).toBe(true);
    expect(tryAcquireTurnLock("lock-c")).toBe(true);
    releaseTurnLock("lock-b");
    releaseTurnLock("lock-c");
  });

  it("release reports no rerun when nothing was debounced", () => {
    tryAcquireTurnLock("lock-d");
    expect(releaseTurnLock("lock-d")).toBe(false);
  });

  it("release reports a pending rerun when a call was debounced mid-turn", () => {
    tryAcquireTurnLock("lock-e");
    tryAcquireTurnLock("lock-e"); // debounced → records a pending rerun
    expect(releaseTurnLock("lock-e")).toBe(true);
  });

  it("consumes the rerun flag on release (next cycle starts clean)", () => {
    tryAcquireTurnLock("lock-f");
    tryAcquireTurnLock("lock-f");
    expect(releaseTurnLock("lock-f")).toBe(true);

    // The rerun re-acquires; with no new debounced call there is no new flag.
    expect(tryAcquireTurnLock("lock-f")).toBe(true);
    expect(releaseTurnLock("lock-f")).toBe(false);
  });

  it("allows re-acquiring after release", () => {
    tryAcquireTurnLock("lock-g");
    releaseTurnLock("lock-g");
    expect(tryAcquireTurnLock("lock-g")).toBe(true);
    releaseTurnLock("lock-g");
  });
});
