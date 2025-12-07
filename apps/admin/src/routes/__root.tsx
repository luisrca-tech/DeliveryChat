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
  // Debug: Log all env vars on server
  if (typeof window === "undefined") {
    console.log("Server env vars:", {
      VITE_API_URL: process.env.VITE_API_URL,
      PUBLIC_API_URL: process.env.PUBLIC_API_URL,
      VERCEL_ENV: process.env.VERCEL_ENV,
      NODE_ENV: process.env.NODE_ENV,
    });
  }

  // Try multiple sources
  const apiUrl =
    typeof window === "undefined"
      ? process.env.VITE_API_URL || 
        process.env.PUBLIC_API_URL ||
        undefined
      : undefined;

  // Always inject, even if undefined, so we can debug
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.__API_URL__ = ${apiUrl ? JSON.stringify(apiUrl) : 'undefined'};
              console.log('Injected API URL:', window.__API_URL__);
            `,
          }}
        />
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
