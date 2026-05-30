# Test Applications

DeliveryChat applications come in two kinds:

- **Production** — your real customer surface. Identified by a public domain
  (`acme.com`). Mints `dk_live_…` API keys.
- **Test** — a local development surface pinned to `localhost:<port>`. Mints
  `dk_test_…` API keys.

A single tenant can hold many test applications side-by-side — one per port —
without touching the production-domain namespace. Use them to iterate on
widget settings, AI context, and integration code from your local machine
without risking customer traffic.

## Create a test application

1. Open the **Applications** page in the admin dashboard.
2. Click **Create Application**.
3. At the top of the dialog, switch the kind toggle to **Test**.
4. Fill in:
   - **Name** — a label for your team (e.g. `Acme — local dev`).
   - **Port** — the local port your dev server runs on (1–65535). The dialog
     shows a `localhost:<port>` preview below the input.
5. Submit.

Once created, the application detail page exposes the same surface as a
production app: settings, AI context, conversations, and API keys.

## Port pinning rules

Test applications are pinned to **one specific port** on **`localhost`**:

- Two active test apps in the same tenant cannot share a port. If you try to
  create a second test app on a port that's already in use, the request
  fails with a 409 and the admin toast names the conflicting app.
- Different tenants can each use the same port — port uniqueness is scoped
  per tenant.
- The widget will be accepted **only** from `http://localhost:<port>` (or
  `*.localhost:<port>`). A request from any other localhost port is
  rejected.
- Soft-deleting a test app frees its port for re-use within that tenant.

> Heads-up: the previous "any test-env API key accepts any localhost" hack
> is **not** in effect for test apps. The declared port is the only origin
> that authenticates. Production apps keep the legacy localhost shortcut so
> they remain debuggable from a developer's machine.

## API keys

Each application kind is locked to a single API-key environment:

| App kind     | Allowed key environment | Prefix       |
| ------------ | ----------------------- | ------------ |
| `production` | `live`                  | `dk_live_…`  |
| `test`       | `test`                  | `dk_test_…`  |

The Create API Key dialog locks the environment dropdown to match the
parent application's kind. Pre-existing keys created before this rule
shipped are **grandfathered** — they continue to authenticate as before.

## Editing a test application

`kind` and `port` are **immutable**. Changing them would invalidate the
allowed origin and any keys minted under the previous configuration. To
move to a different port, soft-delete the old test app (which frees the
port) and create a new one.

`name`, `description`, and `settings` can be edited normally.

## Conflict messages

| Scenario                                    | Toast                                                                                  |
| ------------------------------------------- | -------------------------------------------------------------------------------------- |
| Duplicate production domain (any tenant)    | "Domain already in use." Generic — does not name the conflicting application.          |
| Duplicate test port (same tenant)           | "Port `<n>` is already used by `<application name>`." Names the conflicting app.       |
| Submitting `kind`/`port` to PATCH endpoint  | Rejected — both fields are immutable.                                                  |
| Test app with non-localhost origin          | Widget bearer call rejected with `origin_not_allowed`.                                 |

## Local dev checklist

1. Create a test app on the port your dev server uses (e.g. `5173`).
2. Mint a `dk_test_` API key from the application detail page.
3. Wire the widget on your local page; ensure it loads from
   `http://localhost:5173`.
4. Verify the widget bearer flow returns `200`. From any other port, expect
   `origin_not_allowed` — that's the port-pinning rule working as designed.
