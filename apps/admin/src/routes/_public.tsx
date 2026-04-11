import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getBearerToken } from "../lib/bearerToken";

import "@repo/ui/styles.css";

export const Route = createFileRoute("/_public")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;

    const token = getBearerToken();
    if (token) {
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
          <div className="inline-flex items-center justify-center px-3 py-2 rounded-2xl bg-primary/10 mb-2">
            <img
              src="/logo.png"
              alt=""
              width={160}
              height={88}
              className="h-10 w-auto max-w-[200px] object-contain"
            />
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
