import { TanStackDevtools } from "@tanstack/react-devtools";
import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { Toaster as SonnerToaster } from "sonner";
import { QueryClientProvider } from "@tanstack/react-query";

import "@repo/ui/styles.css";
import { getSubdomain } from "../lib/subdomain";
import { getQueryClient } from "../lib/queryClient";
import { SubdomainForm } from "../features/subdomain";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "TanStack Start Starter",
      },
    ],
    links: [],
  }),

  notFoundComponent: () => {
    let error: string | null = null;
    let message: string | null = null;

    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      error = searchParams.get("error");
      message = searchParams.get("message");
    }

    if (error === "subdomain_required") {
      return (
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center max-w-md mx-auto px-4">
            <h1 className="text-4xl font-bold mb-4">Subdomain Required</h1>
            <p className="text-muted-foreground mb-2">
              {message || "This application requires a tenant subdomain"}
            </p>
            <p className="text-sm text-muted-foreground mt-4">
              Please access this application using a subdomain, for example:
              <br />
              <code className="text-xs bg-muted px-2 py-1 rounded mt-2 inline-block">
                tenant.localhost:3000
              </code>
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold">404</h1>
          <p className="mt-2 text-muted-foreground">Page not found</p>
        </div>
      </div>
    );
  },

  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  if (typeof window !== "undefined") {
    const subdomain = getSubdomain();
    if (!subdomain) {
      return (
        <html lang="en">
          <head>
            <HeadContent />
          </head>
          <body className="antialiased">
            <SubdomainForm />
          </body>
        </html>
      );
    }
  }

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="antialiased">
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
        <SonnerToaster richColors />
        <TanStackDevtools
          config={{
            position: "bottom-right",
          }}
          plugins={[
            {
              name: "Tanstack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  );
}
