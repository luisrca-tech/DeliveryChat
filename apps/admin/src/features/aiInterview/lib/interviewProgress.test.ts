import { describe, expect, it } from "vitest";
import { progressToneForTurn } from "./interviewProgress";

describe("progressToneForTurn", () => {
  it("returns 'neutral' for turns 1 through 7", () => {
    for (let turn = 1; turn <= 7; turn++) {
      expect(progressToneForTurn(turn)).toBe("neutral");
    }
  });

  it("transitions from neutral to green at the 7→8 boundary", () => {
    expect(progressToneForTurn(7)).toBe("neutral");
    expect(progressToneForTurn(8)).toBe("green");
  });

  it("returns 'green' for turns 8 through 12", () => {
    for (let turn = 8; turn <= 12; turn++) {
      expect(progressToneForTurn(turn)).toBe("green");
    }
  });

  it("transitions from green to amber at the 12→13 boundary", () => {
    expect(progressToneForTurn(12)).toBe("green");
    expect(progressToneForTurn(13)).toBe("amber");
  });

  it("returns 'amber' for turns 13 through 15", () => {
    for (let turn = 13; turn <= 15; turn++) {
      expect(progressToneForTurn(turn)).toBe("amber");
    }
  });
});
