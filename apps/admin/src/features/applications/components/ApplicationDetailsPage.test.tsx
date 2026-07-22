import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { ApplicationDetailsPage } from "./ApplicationDetailsPage";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useNavigate: () => vi.fn(),
}));

let mockPlan = "BASIC";
let mockAiAddonActive = false;
vi.mock("@/features/billing/hooks/useBillingStatus", () => ({
  useBillingStatusQuery: () => ({
    data: { plan: mockPlan, aiAddonActive: mockAiAddonActive },
  }),
}));

vi.mock("../hooks/useApplicationQuery", () => ({
  useApplicationQuery: () => ({
    isLoading: false,
    data: {
      application: {
        id: "app_1",
        name: "Acme",
        kind: "production",
        domain: "acme.test",
        description: "",
        allowedOrigins: [],
        port: null,
        aiInterviewStatus: "completed",
        aiAutoRespond: false,
        aiDbEnabled: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    },
  }),
}));

vi.mock("../hooks/useApplicationMutations", () => ({
  useUpdateApplicationMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useToggleApplicationAiSettingMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ApplicationDetailsPage applicationId="app_1" />
    </QueryClientProvider>,
  );
}

describe("ApplicationDetailsPage — AI section plan gate", () => {
  beforeEach(() => {
    mockPlan = "BASIC";
    mockAiAddonActive = false;
  });
  afterEach(() => cleanup());

  function expectSwitchesHidden() {
    expect(screen.queryByLabelText("Toggle AI auto-respond")).toBeNull();
    expect(screen.queryByLabelText("Toggle AI database tools")).toBeNull();
  }

  it.each([
    ["FREE", "free_plan"],
    ["BASIC", "upgrade_plan"],
  ])(
    "hides both AI switches on %s (the add-on can never be purchased there)",
    (plan, expectedLock) => {
      mockPlan = plan;
      renderPage();

      expectSwitchesHidden();
      expect(
        screen.getByTestId("ai-plan-locked-notice").getAttribute("data-lock"),
      ).toBe(expectedLock);
    },
  );

  it.each(["PREMIUM", "ENTERPRISE"])(
    "hides both AI switches on %s while the add-on is inactive, and says to purchase it",
    (plan) => {
      mockPlan = plan;
      mockAiAddonActive = false;
      renderPage();

      expectSwitchesHidden();
      const notice = screen.getByTestId("ai-plan-locked-notice");
      expect(notice.getAttribute("data-lock")).toBe("addon_inactive");
      expect(screen.getByText("Go to Billing")).toBeDefined();
    },
  );

  it.each(["PREMIUM", "ENTERPRISE"])(
    "shows both AI switches on %s once the add-on is active",
    (plan) => {
      mockPlan = plan;
      mockAiAddonActive = true;
      renderPage();

      expect(screen.getByLabelText("Toggle AI auto-respond")).toBeDefined();
      expect(screen.getByLabelText("Toggle AI database tools")).toBeDefined();
      expect(screen.queryByTestId("ai-plan-locked-notice")).toBeNull();
    },
  );

  it("locks the switches again when a Premium org cancels the add-on", () => {
    mockPlan = "PREMIUM";
    mockAiAddonActive = true;
    renderPage();
    expect(screen.getByLabelText("Toggle AI auto-respond")).toBeDefined();

    cleanup();
    mockAiAddonActive = false;
    renderPage();

    expectSwitchesHidden();
    expect(
      screen.getByTestId("ai-plan-locked-notice").getAttribute("data-lock"),
    ).toBe("addon_inactive");
  });
});
