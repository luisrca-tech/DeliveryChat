import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import * as React from "react";
import { FeatureLockedCard } from "./FeatureLockedCard";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

describe("FeatureLockedCard", () => {
  afterEach(() => cleanup());

  it("tells an add-on-eligible org to purchase the add-on", () => {
    render(<FeatureLockedCard lock="addon_inactive" />);

    expect(screen.getByText(/not active on your account/i)).toBeDefined();
    expect(
      screen.queryByText(/available on Premium and Enterprise plans/i),
    ).toBeNull();
    expect(screen.getByText("Go to Billing")).toBeDefined();
  });

  it.each(["free_plan", "upgrade_plan"] as const)(
    "tells a %s org to change plan, not to buy something it cannot buy",
    (lock) => {
      render(<FeatureLockedCard lock={lock} />);

      expect(
        screen.getByText(/available on Premium and Enterprise plans/i),
      ).toBeDefined();
      expect(screen.queryByText(/not active on your account/i)).toBeNull();
      expect(screen.getByText("Go to Billing")).toBeDefined();
    },
  );
});
