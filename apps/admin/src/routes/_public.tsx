import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { authClient } from "../lib/authClient";

import "@repo/ui/styles.css";

export const Route = createFileRoute("/_public")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;

    const session = await authClient.getSession();

    if (session?.data?.session) {
      throw redirect({
        to: "/",
      });
    }
  },
  component: PublicLayout,
});

function PublicLayout() {
  return (
    <div className="min-h-screen bg-linear-to-br from-background via-background to-muted/20 flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-2">
            <svg
              className="w-8 h-8 text-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-label="Chat icon"
              role="img"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </div>
          <h1 className="text-4xl font-bold tracking-tight bg-linear-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            Delivery Chat
          </h1>
          <p className="text-sm text-muted-foreground">
            Your customer support platform
          </p>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
