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
  // Get API URL - try process.env first (SSR), fallback to import.meta.env (build-time)
  const apiUrl =
    typeof window === "undefined"
      ? process.env.VITE_API_URL || import.meta.env.VITE_API_URL
      : undefined;

  // Development fallback
  const finalApiUrl =
    apiUrl ||
    (process.env.NODE_ENV === "development"
      ? "http://localhost:8000"
      : undefined);

  return (
    <html lang="en">
      <head>
        {finalApiUrl && (
          <script
            dangerouslySetInnerHTML={{
              __html: `window.__API_URL__ = ${JSON.stringify(finalApiUrl)};`,
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
