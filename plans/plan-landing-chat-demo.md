# Plan: Landing Page Live Chat Demo

> Source PRD: `plans/prd-landing-chat-demo.md`

## Architectural decisions

- **Island mount point**: `apps/web/src/components/home/Hero.astro` — replace the `aspect-video` placeholder div with a React island (`client:only="react"`). Props (`apiUrl`, `apiKey`, `appId`) injected server-side from Astro env.
- **Env vars**: Server-side only — `DEMO_CHAT_API_KEY`, `DEMO_CHAT_APP_ID` (added); `PUBLIC_ADMIN_URL` (removed); `PUBLIC_API_URL` kept. Managed in Infisical `/web/` path.
- **Visitor identity**: `crypto.randomUUID()` stored in `localStorage` under key `dc_visitor_id`; sent as `X-Visitor-Id` header on every request.
- **API client module**: All `fetch` and `WebSocket` calls isolated in a single module (e.g. `src/features/chat-demo/chat-client.ts`). Components never call `fetch` directly.
- **REST base**: `PUBLIC_API_URL` — every endpoint prefixed `/v1/api/`.
- **WebSocket URL**: `wss://<api-host>/v1/ws?token=<jwt>` — token obtained via `POST /v1/api/ws-token`.
- **UI layout**: Two-panel layout inside the `aspect-video` container — conversation list (left) + active conversation detail (right). Styled with `@repo/ui` design tokens.
- **Optimistic UI**: Sent messages appear immediately with a `pending` state; replaced by server data on `message:ack`.
- **15-minute edit/delete window**: Enforced client-side (controls disabled) in addition to API enforcement.
- **Visitor message identification**: The island identifies which messages belong to the current visitor by finding the first `participants` entry with `role === "visitor"` across loaded conversations and caching that `userId`. Messages whose `senderId` matches are rendered on the right. This avoids a dedicated `/me` endpoint and works for both new and returning visitors.

---

## ~~Phase 1: Island Scaffold & Environment~~ ✅ DONE

**User stories**: US22 (env via Infisical), US23 (remove `PUBLIC_ADMIN_URL`, add `DEMO_CHAT_API_KEY` / `DEMO_CHAT_APP_ID`), US24 (self-contained React island)

### What to build

Remove the faded logo placeholder inside `Hero.astro`'s `aspect-video` div and mount a React island (`client:only="react"`) in its place. The island receives `apiUrl`, `apiKey`, and `appId` as props from Astro server-side env. At this stage the island renders a visible shell (e.g. a loading skeleton or a "Chat Demo" placeholder) so the hero layout can be validated before any API work begins.

Update `apps/web/src/env.ts`: remove `PUBLIC_ADMIN_URL`, add two server-side vars `DEMO_CHAT_API_KEY` and `DEMO_CHAT_APP_ID`. Update Infisical `/web/` accordingly. Remove any import of `PUBLIC_ADMIN_URL` across the web app.

### Acceptance criteria

- [x] `aspect-video` div in Hero now renders the React island (visible in browser at `localhost:3002`)
- [x] Island receives `apiUrl`, `apiKey`, `appId` props; values are non-empty when injected from env
- [x] `env.ts` no longer references `PUBLIC_ADMIN_URL`; TypeScript compiles without errors (`bun run check-types --filter=web`)
- [x] `DEMO_CHAT_API_KEY` and `DEMO_CHAT_APP_ID` are defined as server-side vars in `env.ts` and validated by Zod
- [x] Removing the vars from the environment causes env validation to fail at startup (proves guard works)

---

## ~~Phase 2: Visitor Identity & API Client Module~~ ✅ DONE

**User stories**: US13 (identity persists across refreshes), US20 (uses documented endpoints), US21 (UUID v4 in `localStorage`), US25 (isolated client module)

### What to build

Create `apps/web/src/features/chat-demo/chat-client.ts` — the single module that owns all network I/O. It exports typed functions wrapping every documented REST endpoint and the WebSocket lifecycle. No component imports `fetch` or `WebSocket` directly.

On island mount, call `resolveVisitorId()`: read `dc_visitor_id` from `localStorage`; if absent, generate with `crypto.randomUUID()` and persist it. All subsequent client calls inject `Authorization`, `X-App-Id`, `X-Visitor-Id`, and `Origin` headers automatically.

### Acceptance criteria

- [x] `chat-client.ts` exports typed wrappers for all ten REST endpoints listed in the PRD plus `connectWebSocket`
- [x] `resolveVisitorId()` returns a UUID v4; a second call in the same session returns the same value; clearing `localStorage` yields a new UUID on next load
- [x] Headers (`Authorization`, `X-App-Id`, `X-Visitor-Id`, `Origin`) are present on every outgoing request (verifiable in browser DevTools Network tab)
- [x] No component file imports `fetch` or `new WebSocket(...)` directly
- [x] Unit tests cover `resolveVisitorId` (new UUID generated, existing UUID reused, UUID format validation)

---

## ~~Phase 3: Conversation List & New Conversation~~ ✅ DONE

**User stories**: US1 (live chat visible in hero), US2 (start conversation with subject), US11 (previous conversations visible on return), US12 (open conversation, read history), US19 (readable subjects in operator queue)

### What to build

Render the full two-panel layout inside the island. The left panel calls `GET /v1/api/conversations` on mount and lists each conversation with its subject and status badge. A "New Conversation" button opens an inline form with a subject field; submitting calls `POST /v1/api/conversations` and immediately adds the new conversation to the list and selects it. Selecting any conversation in the list calls `GET /v1/api/conversations/:id/messages` and renders the message history in the right panel (visitor messages on the right, operator messages on the left). No WebSocket yet — data is REST-only at this phase.

### Acceptance criteria

- [x] Left panel lists all visitor conversations on page load (populated via `GET /conversations`)
- [x] Each conversation item shows subject and status badge
- [x] "New Conversation" button opens a subject input; submitting calls `POST /conversations` and the new item appears in the list without a full page reload
- [x] Selecting a conversation loads and renders its message history (`GET /conversations/:id/messages`)
- [x] Returning visitor (same `localStorage` UUID) sees their previous conversations on reload
- [x] A subject entered in the demo appears as-is in the admin dashboard conversation queue
- [x] Layout fits inside the `aspect-video` container without overflow at common viewport widths

---

## ~~Phase 4: Send Messages & WebSocket Real-time~~ ✅ DONE

**User stories**: US3 (send with Enter or button), US4 (message appears immediately), US5 (real-time replies), US14 (connection status indicator), US16 (error feedback on send failure), US17 (demo conversations in admin queue), US18 (operator sees messages in real-time)

### What to build

Add the message input bar to the right panel. Sending a message calls `POST /v1/api/conversations/:id/messages` with optimistic UI (message appears immediately in a `pending` state). On conversation open, fetch a WebSocket token via `POST /v1/api/ws-token`, connect to `wss://<api-host>/v1/ws?token=<jwt>`, and send `room:join`. Handle server events: `message:ack` (replace optimistic message with server data), `message:new` (append incoming operator message), `conversation:accepted`, `conversation:released`, `conversation:resolved` (update conversation status in the list). Display a connection status indicator (connected / disconnected). Show inline error feedback when a send fails (API error or WebSocket not connected).

Heartbeat: send `ping` every 30 seconds; discard `pong`.

### Acceptance criteria

- [x] Pressing Enter or clicking Send calls `message:send` via WebSocket; message appears in the UI immediately with a pending state
- [x] `message:ack` event replaces the pending message with confirmed server data
- [x] Operator reply sent from the admin dashboard appears in the demo UI without a page refresh (`message:new` event)
- [x] Connection status indicator is visible and reflects actual WebSocket state (connected / disconnected)
- [x] When send fails (WS not open), an inline error is shown without crashing the UI
- [x] Demo conversations appear in the admin dashboard pending queue and the operator can accept and reply
- [x] `ping` frame is sent every 30 seconds while connected

---

## ~~Phase 5: Edit, Delete & Unread Counts~~ ✅ DONE

**User stories**: US7 (edit within 15 minutes), US8 (delete within 15 minutes), US9 (unread count badge), US10 (mark as read on open)

### What to build

Add edit and delete controls to visitor-owned messages. Controls are visible only within 15 minutes of the message's `createdAt` timestamp (client-side timer disables them; API also enforces). Editing opens an inline input pre-filled with the message content and calls `PATCH /v1/api/conversations/:id/messages/:messageId`. Deleting calls `DELETE` and removes the message from the UI. Handle `message:edited` and `message:deleted` WebSocket events so edits/deletes made elsewhere reflect in real-time.

For unread counts: `GET /v1/api/conversations/:id/unread` is polled when the conversation is not active and on WebSocket `message:new` events. The count badge appears on the left-panel conversation item. Opening a conversation calls `POST /v1/api/conversations/:id/read` with the latest `messageId` and clears the badge.

### Acceptance criteria

- [x] Edit control is visible on visitor messages sent within the last 15 minutes; disappears after the window closes
- [x] Editing a message calls `PATCH /messages/:id`; updated content appears in the UI
- [x] Delete control works within 15 minutes; message is removed from the UI after `DELETE`
- [x] `message:edited` and `message:deleted` WebSocket events update the UI without a reload
- [x] Conversation list items show an unread count badge when there are unread messages
- [x] Opening a conversation calls `POST /read` and clears the badge

---

## Phase 6: Typing Indicators & Reconnection

**User stories**: US6 (typing indicator when operator is writing), US15 (auto-reconnect, missed messages filled in)

### What to build

Send `typing:start` when the visitor begins typing in the input; send `typing:stop` after a debounce (e.g. 1.5 s of inactivity) or on send. Handle incoming `typing:start` / `typing:stop` events from the operator and show a typing indicator in the right panel.

Implement exponential backoff reconnection: on WebSocket close, wait 1 s then retry, doubling each attempt up to a 30 s ceiling. On successful reconnect, re-fetch a fresh `ws-token` and send `room:join` with the `lastMessageId` stored in `localStorage` for the active conversation. The server responds with `messages:sync` containing any missed messages; append them to the message history. Update `lastMessageId` in `localStorage` whenever a new message is confirmed.

### Acceptance criteria

- [ ] Visitor typing triggers `typing:start` event over WebSocket; debounce triggers `typing:stop` after inactivity
- [ ] Operator typing indicator appears in the right panel when a `typing:start` event is received from the operator
- [ ] Indicator disappears on `typing:stop` or after a timeout
- [ ] WebSocket reconnects automatically after a simulated network drop (DevTools → Network → Offline toggle)
- [ ] Reconnect uses exponential backoff: delays follow 1 s → 2 s → 4 s → … → 30 s max
- [ ] `room:join` on reconnect includes `lastMessageId`; any messages sent while offline appear after reconnect (`messages:sync`)
- [ ] `lastMessageId` in `localStorage` is updated each time a new message is confirmed by the server
