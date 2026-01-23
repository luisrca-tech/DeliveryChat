import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@repo/ui/components/ui/button";
import { authClient } from "../../lib/authClient";
import { getSubdomainUrl } from "../../lib/urls";

export const Route = createFileRoute("/_system/")({
  component: Dashboard,
});

function Dashboard() {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const context = Route.useRouteContext();
  const currentOrganization =
    context && "currentOrganization" in context
      ? context.currentOrganization
      : null;

  return (
    <div className="max-w-5xl">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold mb-2">Dashboard</h1>
          {currentOrganization && (
            <p className="text-muted-foreground">
              Organization: {currentOrganization.name}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          disabled={isLoggingOut}
          onClick={async () => {
            setIsLoggingOut(true);
            try {
              await authClient.signOut({
                fetchOptions: {
                  credentials: "include",
                },
              });
              window.location.href = getSubdomainUrl("/login");
            } catch (error) {
              console.error("Logout error:", error);
              toast.error(
                error instanceof Error ? error.message : "Failed to sign out",
              );
              setIsLoggingOut(false);
            }
          }}
        >
          {isLoggingOut ? "Signing out..." : "Logout"}
        </Button>
      </div>

      <div className="bg-card border border-border rounded-lg p-8 shadow-sm">
        <div className="text-center py-12">
          <h2 className="text-2xl font-semibold mb-4">
            Welcome to Your Dashboard
          </h2>
          <p className="text-muted-foreground mb-8">
            This is a placeholder dashboard. The full dashboard will be
            implemented soon.
          </p>
          <div className="flex flex-col gap-4 items-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <p className="text-sm text-muted-foreground">
              Dashboard features coming soon...
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
