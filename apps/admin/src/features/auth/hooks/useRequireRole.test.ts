// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

const mockNavigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("@/features/billing/hooks/useBillingStatus", () => ({
  useBillingStatusQuery: vi.fn(),
}));

import { useBillingStatusQuery } from "@/features/billing/hooks/useBillingStatus";
import { useRequireRole } from "./useRequireRole";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe("useRequireRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("allows access when user has an allowed role", () => {
    vi.mocked(useBillingStatusQuery).mockReturnValue({
      data: { role: "admin", plan: "BASIC", planStatus: "active", isReady: true, cancelAtPeriodEnd: false, trialEndsAt: null },
      isLoading: false,
    } as any);

    const { result } = renderHook(
      () => useRequireRole(["admin", "super_admin"]),
      { wrapper: createWrapper() },
    );

    expect(result.current.isAllowed).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("redirects when user role is not allowed", () => {
    vi.mocked(useBillingStatusQuery).mockReturnValue({
      data: { role: "operator", plan: "BASIC", planStatus: "active", isReady: true, cancelAtPeriodEnd: false, trialEndsAt: null },
      isLoading: false,
    } as any);

    renderHook(
      () => useRequireRole(["admin", "super_admin"]),
      { wrapper: createWrapper() },
    );

    expect(mockNavigate).toHaveBeenCalledWith({ to: "/" });
  });

  it("returns loading state while billing data is fetching", () => {
    vi.mocked(useBillingStatusQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as any);

    const { result } = renderHook(
      () => useRequireRole(["admin", "super_admin"]),
      { wrapper: createWrapper() },
    );

    expect(result.current.isAllowed).toBe(false);
    expect(result.current.isLoading).toBe(true);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("redirects when billing fetch fails (data is undefined after loading)", () => {
    vi.mocked(useBillingStatusQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as any);

    renderHook(
      () => useRequireRole(["admin", "super_admin"]),
      { wrapper: createWrapper() },
    );

    expect(mockNavigate).toHaveBeenCalledWith({ to: "/" });
  });
});
