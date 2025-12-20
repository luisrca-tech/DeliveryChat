import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { authClient } from "../lib/authClient";
import { getSubdomain } from "../lib/subdomain";

export const Route = createFileRoute("/_system")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;

    const session = await authClient.getSession();

    if (!session?.data?.session) {
      throw redirect({
        to: "/login",
      });
    }

    const subdomain = getSubdomain();

    const orgsResult = await authClient.organization.list();
    const organizations = orgsResult.data || [];

    const currentOrg = organizations.find(
      (org: { slug?: string; id: string }) =>
        org.slug === subdomain || org.id === subdomain
    );

    if (!currentOrg) {
      throw redirect({
        to: "/login",
        search: {
          error: "access_denied",
          message: "You don't have access to this organization",
          redirect: undefined,
        },
      });
    }

    await authClient.organization.setActive({
      organizationId: currentOrg.id,
    });

    return {
      currentOrganization: currentOrg,
      session: session.data.session,
    };
  },
  component: SystemLayout,
});

function SystemLayout() {
  return (
    <div className="min-h-screen bg-background">
      <Outlet />
    </div>
  );
}
