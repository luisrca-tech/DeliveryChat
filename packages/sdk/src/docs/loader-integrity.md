# Loader Integrity (Phase 2)

**Status:** Implemented on `feature/security-loader-integrity` (2026-04-23)
**Related:** [`packages/docs/security/integrator-guide.md`](../../../../../packages/docs/security/integrator-guide.md), [`packages/docs/security/security-roadmap.md`](../../../../../packages/docs/security/security-roadmap.md)

---

## What this slice delivers

Two guarantees for integrators:

1. **The widget bundle is tamper-evident.** Every build emits a deterministic SHA-384 SRI hash artifact alongside `widget.iife.js`. Integrators paste the published snippet, the browser verifies, and a tampered bundle is refused at script-load time.
2. **The widget runs cleanly under a strict host CSP.** No inline scripts, no inline styles in the host document, no `unsafe-eval`. Shadow-root styles are injected via Constructable Stylesheets (`adoptedStyleSheets`) so even `style-src 'self'` (without `'unsafe-inline'`) is sufficient.

## Build-side: SRI artifact

All embed-build concerns live under `apps/widget/embed-build/`:

- `embed-build/sri-artifact.ts` — `writeSriArtifact({ bundlePath, outDir })` reads the bundle, computes the SHA-384 digest, and writes a deterministic `<basename>.sri.json` sidecar (2-space indent, trailing newline). This is the single source of truth for hash algorithm, artifact shape, and serialization format — docs and release scripts consume the sidecar directly, never recompute it by hand.
- `embed-build/plugins.ts` — the `emit-sri-artifact` and `copy-widget-to-public` Vite plugins. Both run in `writeBundle` in registration order; `emit-sri-artifact` runs first so the sidecar is observable to any follow-up plugin.

`vite.embed.config.ts` only wires the plugins; it contains no inline plugin bodies.

### Determinism

Two clean builds with unchanged source produce an identical hash. Verified by `embed-build/build-stability.test.ts`, which spawns `bun run build:embed` twice and asserts the artifact hash is unchanged.

## Runtime: Constructable Stylesheets

Previously, `index.ts` injected widget CSS by creating a `<style>` element and appending it to the Shadow Root. That works, but it forces integrators to permit `style-src 'unsafe-inline'` (or maintain a CSP nonce that the widget bundle cannot influence).

`utils/inject-styles.ts#injectShadowStyles` now:

1. Feature-detects `CSSStyleSheet` + `replaceSync` + `shadow.adoptedStyleSheets`.
2. Constructs a `CSSStyleSheet`, calls `replaceSync(css)`, and assigns `shadow.adoptedStyleSheets = [sheet]`.
3. Falls back to a `<style>` element only in environments without Constructable Stylesheets (legacy test runtimes). All evergreen browsers in the support matrix have native support.

Constructable Stylesheets are exempt from `style-src 'unsafe-inline'` because the stylesheet is constructed in JS rather than parsed from HTML or a `style` attribute.

## What is intentionally NOT in this slice

- **Origin allow-list** — Phase 3a / 3b.
- **Per-visitor rate limit** — Phase 4.
- **WS token binding** — Phase 5.
- **Removing programmatic `element.style.*` writes** — these set style properties via CSSOM and are not subject to `style-src 'unsafe-inline'`. They stay.

## Audit checklist (per build / per PR)

| Check | How |
|---|---|
| No `<script>` injection into host document | `grep -nr "createElement(\"script\")" apps/widget/src/widget/` |
| No `<style>` injection into host document or Shadow Root | `grep -nr "createElement(\"style\")" apps/widget/src/widget/` should match nothing outside the fallback in `inject-styles.ts` |
| No `eval` / `new Function(` | `grep -nrE "(\beval\b|new Function\()" apps/widget/src/widget/` |
| No inline event-handler attributes | already enforced — events bound via `addEventListener` |
