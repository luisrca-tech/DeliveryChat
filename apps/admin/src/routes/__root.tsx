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

  let apiUrl: string | undefined;

  if (isServer) {
    apiUrl = env.VITE_API_URL;

    if (!apiUrl && env.NODE_ENV === "development") {
      apiUrl = "http://localhost:8000";
    }
  }

  const buildTimeUrl = import.meta.env.VITE_API_URL;
  const isDev = import.meta.env.DEV;

  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var ssrUrl = ${apiUrl ? JSON.stringify(apiUrl) : "null"};
                if (ssrUrl) {
                  window.__API_URL__ = ssrUrl;
                  return;
                }
                var buildUrl = ${buildTimeUrl ? JSON.stringify(buildTimeUrl) : "null"};
                if (buildUrl) {
                  window.__API_URL__ = buildUrl;
                  return;
                }
                var isDev = ${isDev ? "true" : "false"};
                if (isDev) {
                  window.__API_URL__ = "http://localhost:8000";
                  return;
                }
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
