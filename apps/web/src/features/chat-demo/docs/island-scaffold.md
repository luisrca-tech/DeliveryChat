# Chat Demo Island — Scaffold & Environment

Phase 1 of the landing page live chat demo. Establishes the React island mount point and server-side env configuration.

## What was built

- `ChatDemoIsland.tsx` — React island mounted inside `Hero.astro`'s `aspect-video` container via `client:only="react"`. Receives `apiUrl`, `apiKey`, and `appId` as props injected server-side from Astro env. Renders a visible placeholder shell at this phase.
- `env.ts` updated: `PUBLIC_ADMIN_URL` removed from the Zod schema; `DEMO_CHAT_API_KEY` and `DEMO_CHAT_APP_ID` added as server-side required vars. Startup fails if either is absent (env guard is intentional).
- `urls.ts` updated: `getAdminUrl` no longer reads from the typed `env` object; it reads `import.meta.env.PUBLIC_ADMIN_URL` directly so the post-registration redirect continues to work without re-adding the var to the schema.

## Why `client:only="react"` and not `client:load`

`client:load` causes Astro to SSR the component and then hydrate it. Future phases of this island use `localStorage` (visitor UUID) and `WebSocket` — both browser-only APIs that throw during SSR. `client:only` skips server rendering entirely.

## Environment variables

| Variable            | Side   | Purpose                                        |
| ------------------- | ------ | ---------------------------------------------- |
| `PUBLIC_API_URL`    | client | Base URL for all REST and WebSocket calls      |
| `DEMO_CHAT_API_KEY` | server | Bearer token passed as prop to the island      |
| `DEMO_CHAT_APP_ID`  | server | App UUID passed as prop to the island          |

Server-side vars are injected into props at request time and never shipped to the browser as raw env references. `PUBLIC_ADMIN_URL` is still read at runtime by `getAdminUrl` but is no longer schema-validated — the function throws if it is absent in production.

## Infisical path

All three vars live under `/web/` in Infisical. `PUBLIC_ADMIN_URL` must remain in that path if the registration redirect flow is needed in production.
