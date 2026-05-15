# Landing Page Chat Demo — Architecture

A live chat demo embedded in the `apps/web` Hero section. Visitors can start conversations and exchange messages with the support team in real-time, using the same WebSocket infrastructure as the production widget.

## Island mount point

`apps/web/src/components/home/Hero.astro` hosts the island inside the `aspect-video` container:

```astro
<ChatDemoIsland
  apiUrl={apiUrl}
  apiKey={apiKey}
  appId={appId}
  client:only="react"
/>
```

Props (`apiUrl`, `apiKey`, `appId`) are injected server-side from Astro env at request time — never exposed as raw env references in client bundles.

## Visitor identity

A UUID v4 is generated once via `crypto.randomUUID()` and stored in `localStorage` under `dc_visitor_id`. All requests carry this as `X-Visitor-Id`. This gives returning visitors access to their previous conversations without authentication.

## API client isolation

All `fetch` and `WebSocket` calls are centralised in `apps/web/src/features/chat-demo/chat-client.ts`. No component imports `fetch` or `new WebSocket(...)` directly.

## REST base and WebSocket URL

| Transport | Pattern                              |
| --------- | ------------------------------------ |
| REST      | `{PUBLIC_API_URL}/v1/api/…`          |
| WebSocket | `wss://{api-host}/v1/ws?token={jwt}` |

The JWT is obtained via `POST /v1/api/ws-token` immediately before opening the socket.

## Headers on every request

| Header          | Value                        |
| --------------- | ---------------------------- |
| `Authorization` | `Bearer {DEMO_CHAT_API_KEY}` |
| `X-App-Id`      | `{DEMO_CHAT_APP_ID}`         |
| `X-Visitor-Id`  | UUID from `localStorage`     |
| `Origin`        | Current page origin          |

## UI layout

Two-panel layout inside the `aspect-video` container:

- **Left panel** — conversation list with subject and status badge
- **Right panel** — active conversation message history + input bar

## Phases

| Phase | Scope                                                                                             |
| ----- | ------------------------------------------------------------------------------------------------- |
| 1     | Island scaffold, env cleanup (`DEMO_CHAT_API_KEY`, `DEMO_CHAT_APP_ID`, remove `PUBLIC_ADMIN_URL`) |
| 2     | Visitor identity + API client module (`chat-client.ts`)                                           |
| 3     | Conversation list, new conversation form, message history (REST-only)                             |
| 4     | Send messages, optimistic UI, WebSocket real-time                                                 |
| 5     | Edit/delete within 15-minute window, unread count badges                                          |
| 6     | Typing indicators, exponential backoff reconnection, `messages:sync`                              |

See `apps/web/src/features/chat-demo/docs/` for phase-level implementation notes.
