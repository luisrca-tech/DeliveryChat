# Public API (plans & docs)

Public, unauthenticated marketing/documentation endpoints — **no auth, no
tenant resolution**. Registered as `publicRoute` in `src/routes/public/`
(folder split: `index.ts` wires rate limiting + mounts `plans.ts` and
`docs.ts`), mounted in `src/lib/api.ts` under `/public`.

All routes are IP-rate-limited via `sharedVisitorRateLimiter`
(`createVisitorRateLimitMiddleware`), applied at the `*` level in `index.ts`.
There is no visitor identity here, so it always falls through to the limiter's
IP-based key (`visitor-ip:<ip>`).

---

# Plans endpoint

`GET /api/v1/public/plans` — public marketing pricing.

## Why it exists

Two consumers:

1. **The marketing site / registration flow** can show live pricing without
   any tenant context.
2. **Dogfooding as an AI DataTool.** This is the first HTTP DataTool
   (`features/ai-data/`) that DeliveryChat registers against its own API, so
   the widget's AI assistant can answer "how much does it cost?" from live
   data instead of a hardcoded answer baked into the system prompt. See the
   "Dogfooding" section in
   `apps/hono-api/src/features/ai-data/docs/data-tool-management.md` for how
   it is wired up as a tool named `getPlanInfo`.

## Response shape

```json
{
  "plans": [
    {
      "id": "FREE",
      "name": "Free",
      "prices": null,
      "limits": { "apiKeys": 3, "members": 3, "aiAssistant": false, "aiMonthlyCap": 0 }
    },
    {
      "id": "BASIC",
      "name": "Basic",
      "prices": {
        "brl": { "amount": 9000, "formatted": "R$ 90/month" },
        "usd": { "amount": 1900, "formatted": "$19/month" }
      },
      "limits": { "apiKeys": 5, "members": 6, "aiAssistant": false, "aiMonthlyCap": 0 }
    },
    { "id": "PREMIUM", "...": "same shape as BASIC" },
    {
      "id": "ENTERPRISE",
      "name": "Enterprise",
      "prices": "custom",
      "limits": { "apiKeys": 1000, "members": 1000, "aiAssistant": true, "aiMonthlyCap": 3000 }
    }
  ]
}
```

- `limits` are the small, public-safe subset of `src/lib/planLimits.ts`
  (`API_KEY_LIMITS`, `MEMBER_LIMITS`, `AI_LIMITS`) — no rate-limit internals.
- `FREE.prices` is always `null` (no paid plan). `ENTERPRISE.prices` is
  always the string `"custom"` (billing is manual, no Stripe price object).
- `BASIC` / `PREMIUM` prices are fetched live from Stripe
  (`STRIPE_BASIC_PRICE_KEY` / `STRIPE_PREMIUM_PRICE_KEY`) with
  `expand: ["currency_options"]`, reading the `brl` amount from the price's
  default currency and the `usd` amount from `currency_options.usd` (falling
  back to the top-level `unit_amount`/`currency` if the price's default
  currency happens to be `usd`).

## Caching

- **In-memory, module-level, ~10 minute TTL** (`CACHE_TTL_MS` in
  `public.ts`). No new infra (no Redis) — this mirrors the "boring on
  purpose" bias used elsewhere in the codebase (e.g. the in-memory rate
  limiter stores) and is acceptable because a stale price for a few minutes
  on a marketing endpoint has no correctness impact.
- **Stripe failure never 500s.** The error is logged
  (`console.error`) and the endpoint serves the **stale cache** if one
  exists, or `prices: null` for BASIC/PREMIUM if there is no cache yet.
  `limits` are always served (they never depend on Stripe).
- The HTTP response also sets `Cache-Control: public, max-age=300` (5 min),
  mirroring the pattern used by `GET /widget/settings/:appId`.

---

# Docs endpoints

Three endpoints in `src/routes/public/docs.ts` that expose DeliveryChat's own
documentation (widget install, SDK methods, REST API) so the tenant AI can
ground answers in the real docs — the second dogfooded DataTool surface after
plans.

## Corpus strategy — build-time snapshot, not runtime fetch

The docs live in the **same monorepo** as source MDX
(`apps/docs/src/content/v1/**/*.mdx`, a Nextra site deployed at
`https://docs.deliverychat.online/v1/<slug>`). Fetching + HTML-parsing the
deployed Next.js app at runtime would be fragile, so instead a build step
snapshots the MDX into hono-api:

- `scripts/generate-docs-corpus.ts` reads every `.mdx` (+ `_meta.json` for
  titles/ordering), strips MDX/JSX component tags, imports/exports, comments
  and frontmatter into plain-markdown text (code fences kept **verbatim**),
  extracts a title (first `# ` heading or `_meta.json` label), and writes
  `src/generated/docsCorpus.json` (`[{ slug, title, description?, content }]`).
- It is wired into `predev`/`prebuild`, so the corpus is always fresh in dev
  and CI. The generated JSON is **committed** and imported statically — the API
  never fetches at runtime and never depends on `apps/docs` existing at
  runtime. `hono-api` deploys separately from the docs app.
- No cache/TTL is needed (unlike `/plans`) — the corpus is regenerated at
  build time.

`slug` conventions mirror Nextra routing: the root `index.mdx` → slug `index`
(url = the `/v1` base), a folder's `index.mdx` → the folder slug (e.g.
`ai-assistant`), and nested files → `dir/file` (e.g. `sdk/methods`). `url` in
every response is `https://docs.deliverychat.online/v1/<slug>` (`DOCS_BASE_URL`
constant — there is no docs-site env var, and none was added).

## `GET /api/v1/public/docs/pages`

Lists every page: `{ pages: [{ slug, title, description?, url }] }`.

## `GET /api/v1/public/docs/pages/:slug`

Single page: `{ slug, title, url, content }`, where `content` is the
plain-text markdown snapshot **trimmed to ~8KB** (`MAX_CONTENT_CHARS`,
keeping tool responses compact). If the content was cut, the response also
carries `"truncated": true`.

- `:slug` uses a regex param (`:slug{.+}`) so slashed slugs like `sdk/methods`
  match.
- Slug validation: must match `[a-z0-9/-]+` and must not contain `..` or
  slash-edge/`//` segments — invalid slugs → `400` via `jsonError`; valid but
  unknown slugs → `404`.

## `GET /api/v1/public/docs/search?q=`

Case-insensitive full-text search over the corpus (title + content):
`{ results: [{ slug, title, url, snippet }] }`.

- `q` must be at least 2 characters, else `400` via `jsonError`.
- `snippet` is ~300 chars of context around the first content match (or the
  content start when only the title matched).
- Capped at 5 results; no matches → `results: []`.

## Testability

`docs.ts` exports `createDocsRoute(corpus = generatedCorpus)`. The corpus is
**injectable**, so tests supply a synthetic corpus (e.g. a deterministic long
page to exercise the truncation flag) while production uses the generated
import — mirroring how other modules inject test doubles.
