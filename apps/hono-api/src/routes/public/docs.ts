import { Hono } from "hono";
import { jsonError, HTTP_STATUS } from "../../lib/http.js";
import generatedCorpus from "../../generated/docsCorpus.json" with { type: "json" };

/**
 * `GET /public/docs/*` — public, unauthenticated access to a build-time
 * snapshot of DeliveryChat's own documentation (widget install, SDK methods,
 * REST API). Dogfooded as the `searchDocs` / `getDocsPage` AI DataTools so the
 * tenant AI can ground answers in the real docs. See public-api.md and
 * features/ai-data/docs/data-tool-management.md ("Dogfooding").
 *
 * The corpus is generated at build time from apps/docs (see
 * scripts/generate-docs-corpus.ts) and imported statically — there is no
 * runtime fetching and no dependency on apps/docs at runtime.
 */

export type DocEntry = {
  slug: string;
  title: string;
  description?: string;
  content: string;
};

/** Public docs site — a plain constant (no env var exists for it). */
const DOCS_BASE_URL = "https://docs.deliverychat.online/v1";

/** Content payloads are capped so tool responses stay compact (~8KB). */
const MAX_CONTENT_CHARS = 8000;
/** Characters of context returned around a search match. */
const SNIPPET_CHARS = 300;
/** Minimum length of a search query. */
const MIN_QUERY_LENGTH = 2;
/** Maximum number of search results returned. */
const MAX_SEARCH_RESULTS = 5;

const SLUG_PATTERN = /^[a-z0-9/-]+$/;

const defaultCorpus = generatedCorpus as DocEntry[];

function urlForSlug(slug: string): string {
  return slug === "index" ? DOCS_BASE_URL : `${DOCS_BASE_URL}/${slug}`;
}

function isValidSlug(slug: string): boolean {
  if (!SLUG_PATTERN.test(slug)) return false;
  // Reject path traversal and empty/odd segments.
  if (slug.includes("..")) return false;
  if (slug.startsWith("/") || slug.endsWith("/") || slug.includes("//")) {
    return false;
  }
  return true;
}

function truncate(content: string): { content: string; truncated: boolean } {
  if (content.length <= MAX_CONTENT_CHARS) {
    return { content, truncated: false };
  }
  return { content: content.slice(0, MAX_CONTENT_CHARS), truncated: true };
}

function buildSnippet(content: string, matchIndex: number): string {
  const half = Math.floor(SNIPPET_CHARS / 2);
  const start = Math.max(0, matchIndex - half);
  const end = Math.min(content.length, matchIndex + half);
  let snippet = content.slice(start, end).replace(/\s+/g, " ").trim();
  if (start > 0) snippet = `…${snippet}`;
  if (end < content.length) snippet = `${snippet}…`;
  return snippet;
}

/**
 * Build the docs routes. The corpus is injectable so tests can supply a
 * synthetic corpus (e.g. to exercise truncation); production uses the
 * generated import.
 */
export function createDocsRoute(corpus: DocEntry[] = defaultCorpus) {
  return new Hono()
    .get("/docs/pages", (c) => {
      const pages = corpus.map((entry) => ({
        slug: entry.slug,
        title: entry.title,
        ...(entry.description ? { description: entry.description } : {}),
        url: urlForSlug(entry.slug),
      }));
      return c.json({ pages });
    })
    .get("/docs/search", (c) => {
      const q = c.req.query("q")?.trim() ?? "";
      if (q.length < MIN_QUERY_LENGTH) {
        return jsonError(
          c,
          HTTP_STATUS.BAD_REQUEST,
          "bad_request",
          `Query parameter "q" must be at least ${MIN_QUERY_LENGTH} characters.`,
        );
      }

      const needle = q.toLowerCase();
      const results: {
        slug: string;
        title: string;
        url: string;
        snippet: string;
      }[] = [];

      for (const entry of corpus) {
        const haystack = entry.content.toLowerCase();
        let matchIndex = haystack.indexOf(needle);
        if (matchIndex === -1 && entry.title.toLowerCase().includes(needle)) {
          // Title matched but body did not — anchor the snippet at the start.
          matchIndex = 0;
        }
        if (matchIndex === -1) continue;

        results.push({
          slug: entry.slug,
          title: entry.title,
          url: urlForSlug(entry.slug),
          snippet: buildSnippet(entry.content, matchIndex),
        });
        if (results.length >= MAX_SEARCH_RESULTS) break;
      }

      return c.json({ results });
    })
    .get("/docs/pages/:slug{.+}", (c) => {
      const slug = c.req.param("slug");
      if (!isValidSlug(slug)) {
        return jsonError(
          c,
          HTTP_STATUS.BAD_REQUEST,
          "bad_request",
          "Invalid documentation slug.",
        );
      }

      const entry = corpus.find((e) => e.slug === slug);
      if (!entry) {
        return jsonError(
          c,
          HTTP_STATUS.NOT_FOUND,
          "not_found",
          `No documentation page for slug "${slug}".`,
        );
      }

      const { content, truncated } = truncate(entry.content);
      return c.json({
        slug: entry.slug,
        title: entry.title,
        url: urlForSlug(entry.slug),
        content,
        ...(truncated ? { truncated: true } : {}),
      });
    });
}

export const docsRoute = createDocsRoute();
