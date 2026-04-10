// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

vi.mock("@/lib/authClient", () => ({
  authClient: {
    getSession: vi.fn(),
    organization: {
      list: vi.fn(),
      setActive: vi.fn(),
    },
  },
}));

vi.mock("@/lib/subdomain", () => ({
  getSubdomain: vi.fn(() => "test-tenant"),
}));

import { authClient } from "@/lib/authClient";
import { useAuthSession, authSessionQueryKey } from "./useAuthSession";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe("useAuthSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns session, user, and organization on success", async () => {
    const mockSession = { id: "sess_1", userId: "u1" };
    const mockUser = { id: "u1", name: "Luis" };
    const mockOrg = { id: "org_1", slug: "test-tenant", name: "Test Org" };

    vi.mocked(authClient.getSession).mockResolvedValue({
      data: { session: mockSession, user: mockUser },
      error: null,
    } as any);

    vi.mocked(authClient.organization.list).mockResolvedValue({
      data: [mockOrg, { id: "org_2", slug: "other", name: "Other" }],
      error: null,
    } as any);

    vi.mocked(authClient.organization.setActive).mockResolvedValue({
      data: mockOrg,
      error: null,
    } as any);

    const { result } = renderHook(() => useAuthSession(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({
      session: mockSession,
      user: mockUser,
      currentOrganization: mockOrg,
    });
    expect(authClient.organization.setActive).toHaveBeenCalledWith({
      organizationId: "org_1",
    });
  });

  it("returns null when session is missing", async () => {
    vi.mocked(authClient.getSession).mockResolvedValue({
      data: null,
      error: null,
    } as any);

    const { result } = renderHook(() => useAuthSession(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBeNull();
    expect(authClient.organization.list).not.toHaveBeenCalled();
  });

  it("returns null when no matching organization for subdomain", async () => {
    vi.mocked(authClient.getSession).mockResolvedValue({
      data: {
        session: { id: "sess_1", userId: "u1" },
        user: { id: "u1" },
      },
      error: null,
    } as any);

    vi.mocked(authClient.organization.list).mockResolvedValue({
      data: [{ id: "org_2", slug: "other-tenant", name: "Other" }],
      error: null,
    } as any);

    const { result } = renderHook(() => useAuthSession(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBeNull();
    expect(authClient.organization.setActive).not.toHaveBeenCalled();
  });

  it("exports a stable query key", () => {
    expect(authSessionQueryKey).toEqual(["auth", "session"]);
  });
});
