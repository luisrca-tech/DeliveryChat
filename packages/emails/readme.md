# @repo/emails

React Email templates for Delivery Chat.

## Preview (React Email CLI)

Run the preview server on port **3004**:

```bash
cd packages/emails
bun run dev
```

Then open `http://localhost:3004`.

- Templates live in `src/templates/`.
- The preview server reads from `src/templates/` and ignores folders prefixed with `_` (we use `_components`).

## Build (for server-side sending)

`apps/hono-api` imports templates from this package at runtime, so build outputs go to `dist/`.

```bash
cd packages/emails
bun run build
```

## Tests

```bash
cd packages/emails
bun run test
```

