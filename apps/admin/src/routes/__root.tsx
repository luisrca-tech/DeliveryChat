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

  // Try multiple sources for API URL on server
  let apiUrl: string | undefined;

  if (isServer) {
    // Priority 1: process.env (available during SSR/runtime)
    apiUrl = process.env.VITE_API_URL;

    // Priority 2: Try Nitro runtimeConfig (if available)
    if (!apiUrl && typeof (globalThis as any).useRuntimeConfig === "function") {
      try {
        const config = (globalThis as any).useRuntimeConfig();
        apiUrl = config.public?.VITE_API_URL || config.VITE_API_URL;
      } catch (e) {
        // Nitro config not available
      }
    }

    // Priority 3: Development fallback
    if (!apiUrl && env.NODE_ENV === "development") {
      apiUrl = "http://localhost:8000";
    }

    // Debug: Log SSR environment check
    const allViteKeys = Object.keys(process.env).filter((k) =>
      k.startsWith("VITE_")
    );
    const allEnvKeys = Object.keys(process.env).sort();

    console.log("[SSR] RootDocument - Environment check:", {
      "process.env.VITE_API_URL": process.env.VITE_API_URL
        ? `✓ ${process.env.VITE_API_URL.substring(0, 30)}...`
        : "✗ Not set",
      "process.env.VERCEL": process.env.VERCEL || "✗ Not set",
      "process.env.VERCEL_ENV": process.env.VERCEL_ENV || "✗ Not set",
      "env.NODE_ENV": env.NODE_ENV,
      "resolved apiUrl": apiUrl || "✗ undefined",
      "All VITE_ keys": allViteKeys.length > 0 ? allViteKeys : "✗ None found",
      "Sample env keys (first 20)": allEnvKeys.slice(0, 20),
      "Total env keys": allEnvKeys.length,
    });

    if (!apiUrl) {
      console.error(
        "[SSR] ⚠️ WARNING: No API URL resolved! This will cause client-side errors."
      );
    }
  }

  // Build-time env var for client-side fallback (Vite replaces this)
  const buildTimeUrl = import.meta.env.VITE_API_URL;
  const isDev = import.meta.env.DEV;

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
