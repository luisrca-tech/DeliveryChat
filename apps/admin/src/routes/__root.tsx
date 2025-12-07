import { TanStackDevtools } from "@tanstack/react-devtools";
import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";

import appCss from "@repo/ui/styles.css?url";

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
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),

  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold">404</h1>
        <p className="mt-2 text-muted-foreground">Page not found</p>
      </div>
    </div>
  ),

  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  const getApiUrl = () => {
    if (typeof window !== "undefined") return undefined; // Client-side, will use injected value

    // Try environment variables - these should be set in Vercel
    if (process.env.VITE_API_URL) return process.env.VITE_API_URL;
    if (process.env.PUBLIC_API_URL) return process.env.PUBLIC_API_URL;

    // Only use localhost for local development
    if (process.env.NODE_ENV === "development" || !process.env.VERCEL) {
      return "http://localhost:8000";
    }

    // If we're on Vercel but no env var is set, log error
    console.error(
      "VITE_API_URL or PUBLIC_API_URL environment variable is not set in Vercel."
    );
    return undefined;
  };

  const apiUrl = getApiUrl();

  // Debug: Log on server to help diagnose
  if (typeof window === "undefined") {
    console.log("Server env vars check:", {
      VITE_API_URL: process.env.VITE_API_URL ? "✓ Set" : "✗ Not set",
      PUBLIC_API_URL: process.env.PUBLIC_API_URL ? "✓ Set" : "✗ Not set",
      VERCEL_ENV: process.env.VERCEL_ENV,
      NODE_ENV: process.env.NODE_ENV,
      resolvedApiUrl: apiUrl || "undefined",
    });
  }

  // Inject API URL if available - MUST be first script in head (before HeadContent)
  // This ensures window.__API_URL__ is available before any module code runs
  return (
    <html lang="en">
      <head>
        {apiUrl ? (
          <script
            dangerouslySetInnerHTML={{
              __html: `
                (function() {
                  window.__API_URL__ = ${JSON.stringify(apiUrl)};
                  console.log('Injected API URL:', window.__API_URL__);
                })();
              `,
            }}
          />
        ) : (
          <script
            dangerouslySetInnerHTML={{
              __html: `
                console.error('API URL not available during SSR. Check Vercel environment variables.');
              `,
            }}
          />
        )}
        <HeadContent />
      </head>
      <body>
        {children}
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
