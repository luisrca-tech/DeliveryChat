import { TanStackDevtools } from "@tanstack/react-devtools";
import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";

import appCss from "@repo/ui/styles.css?url";
import { env } from "../env";

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
  const isServer = typeof window === "undefined";

  // Get API URL - use process.env on server (VITE_ vars are client-only in env.ts)
  const apiUrl = isServer
    ? process.env.VITE_API_URL ||
      (env.NODE_ENV === "development" ? "http://localhost:8000" : undefined)
    : undefined;

  // Build-time env var for client-side fallback (Vite replaces this)
  const buildTimeUrl = import.meta.env.VITE_API_URL;
  const isDev = import.meta.env.DEV;

  // Debug: Log SSR environment check
  if (isServer) {
    console.log("[SSR] RootDocument - Environment check:", {
      "process.env.VITE_API_URL": process.env.VITE_API_URL
        ? `✓ ${process.env.VITE_API_URL.substring(0, 30)}...`
        : "✗ Not set",
      "env.NODE_ENV": env.NODE_ENV,
      "resolved apiUrl": apiUrl || "undefined",
      "import.meta.env.VITE_API_URL": import.meta.env.VITE_API_URL
        ? `✓ ${import.meta.env.VITE_API_URL.substring(0, 30)}...`
        : "✗ Not set (expected on server)",
      VERCEL: process.env.VERCEL,
      VERCEL_ENV: process.env.VERCEL_ENV,
    });
  }

  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                console.log('[CLIENT] API URL injection script running...');
                // Priority 1: SSR injected value (from env.ts)
                var ssrUrl = ${apiUrl ? JSON.stringify(apiUrl) : "null"};
                console.log('[CLIENT] SSR URL:', ssrUrl);
                if (ssrUrl) {
                  window.__API_URL__ = ssrUrl;
                  console.log('[CLIENT] ✓ Using SSR injected URL:', ssrUrl);
                  return;
                }
                // Priority 2: Build-time env var (Vite replacement)
                var buildUrl = ${buildTimeUrl ? JSON.stringify(buildTimeUrl) : "null"};
                console.log('[CLIENT] Build-time URL:', buildUrl);
                if (buildUrl) {
                  window.__API_URL__ = buildUrl;
                  console.log('[CLIENT] ✓ Using build-time URL:', buildUrl);
                  return;
                }
                // Priority 3: Development fallback
                var isDev = ${isDev ? "true" : "false"};
                console.log('[CLIENT] Is dev mode:', isDev);
                if (isDev) {
                  window.__API_URL__ = "http://localhost:8000";
                  console.log('[CLIENT] ✓ Using dev fallback: http://localhost:8000');
                  return;
                }
                console.error('[CLIENT] ✗ No API URL available!');
              })();
            `,
          }}
        />
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
