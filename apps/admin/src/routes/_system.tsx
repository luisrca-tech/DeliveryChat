import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { getBearerToken } from "../lib/bearerToken";
import { getSubdomain } from "../lib/subdomain";
import { AppShell } from "@/features/layout/components/AppShell";
import { useAuthSession } from "@/features/auth/hooks/useAuthSession";

export const Route = createFileRoute("/_system")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;

    const token = getBearerToken();
    if (!token) {
      throw redirect({
        to: "/login",
        search: {
          redirect: window.location.pathname + window.location.search,
          error: undefined,
          message: undefined,
        },
      });
    }

    const subdomain = getSubdomain();
    if (!subdomain) {
      throw redirect({
        to: "/login",
        search: {
          error: "access_denied",
          message: "Subdomain is required",
          redirect: undefined,
        },
      });
    }
  },
  component: SystemLayout,
});

function SystemLayout() {
  const { data, isLoading } = useAuthSession();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </div>
      </AppShell>
    );
  }

  if (!data) {
    navigate({
      to: "/login",
      search: {
        error: "access_denied",
        message: "You don't have access to this organization",
        redirect: undefined,
      },
    });
    return null;
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
