import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { createDocsRoute, type DocEntry } from "../docs.js";

const DOCS_BASE_URL = "https://docs.deliverychat.online/v1";

const syntheticCorpus: DocEntry[] = [
  {
    slug: "index",
    title: "Getting Started",
    description: "Welcome to the docs.",
    content: "# Getting Started\n\nWelcome to the docs.",
  },
  {
    slug: "sdk/methods",
    title: "SDK Methods",
    content:
      "# SDK Methods\n\nThe init() method boots the widget. Call destroy() to tear it down.",
  },
  {
    slug: "long-page",
    title: "Long Page",
    // Deterministic long body to exercise truncation (> 8000 chars).
    content: `# Long Page\n\n${"lorem ipsum dolor sit amet ".repeat(500)}`,
  },
];

function app(corpus: DocEntry[] = syntheticCorpus) {
  return new Hono().route("/public", createDocsRoute(corpus));
}

describe("GET /public/docs/pages", () => {
  it("returns the list of pages with slug, title, description and url", async () => {
    const res = await app().request("/public/docs/pages");
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(Array.isArray(body.pages)).toBe(true);
    expect(body.pages).toHaveLength(3);

    const index = body.pages.find((p: { slug: string }) => p.slug === "index");
    expect(index).toEqual({
      slug: "index",
      title: "Getting Started",
      description: "Welcome to the docs.",
      url: DOCS_BASE_URL,
    });

    const methods = body.pages.find(
      (p: { slug: string }) => p.slug === "sdk/methods",
    );
    expect(methods.url).toBe(`${DOCS_BASE_URL}/sdk/methods`);
    // No description provided for this entry → key omitted.
    expect(methods.description).toBeUndefined();
  });
});

describe("GET /public/docs/pages/:slug", () => {
  it("returns a single page (happy path)", async () => {
    const res = await app().request("/public/docs/pages/sdk/methods");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.slug).toBe("sdk/methods");
    expect(body.title).toBe("SDK Methods");
    expect(body.url).toBe(`${DOCS_BASE_URL}/sdk/methods`);
    expect(body.content).toContain("init()");
    expect(body.truncated).toBeUndefined();
  });

  it("returns 404 for an unknown slug", async () => {
    const res = await app().request("/public/docs/pages/does-not-exist");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
  });

  it("returns 400 for a traversal slug (percent-encoded to survive URL normalization)", async () => {
    const res = await app().request("/public/docs/pages/..%2fsecret");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
  });

  it("returns 400 for an invalid slug (uppercase / illegal chars)", async () => {
    const res = await app().request("/public/docs/pages/Bad_Slug");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
  });

  it("sets truncated:true and caps content on a long page", async () => {
    const res = await app().request("/public/docs/pages/long-page");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.truncated).toBe(true);
    expect(body.content.length).toBe(8000);
  });
});

describe("GET /public/docs/search", () => {
  it("finds an SDK term across the corpus with a snippet", async () => {
    const res = await app().request("/public/docs/search?q=destroy");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results.length).toBeGreaterThanOrEqual(1);
    const first = body.results[0];
    expect(first.slug).toBe("sdk/methods");
    expect(first.url).toBe(`${DOCS_BASE_URL}/sdk/methods`);
    expect(first.snippet.toLowerCase()).toContain("destroy");
  });

  it("matches natural multi-word queries whose exact phrase never appears", async () => {
    const res = await app().request(
      `/public/docs/search?q=${encodeURIComponent("install widget")}`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results.length).toBeGreaterThanOrEqual(1);
  });

  it("ranks an exact-phrase match above token-only matches", async () => {
    const corpus: DocEntry[] = [
      {
        slug: "tokens-only",
        title: "Tokens Only",
        content: "the widget is here and the install steps are there",
      },
      {
        slug: "exact-phrase",
        title: "Exact Phrase",
        content: "how to install widget in one step",
      },
    ];
    const res = await app(corpus).request(
      `/public/docs/search?q=${encodeURIComponent("install widget")}`,
    );
    const body = await res.json();
    expect(body.results.map((r: { slug: string }) => r.slug)).toEqual([
      "exact-phrase",
      "tokens-only",
    ]);
  });

  it("returns 400 when q is shorter than 2 chars", async () => {
    const res = await app().request("/public/docs/search?q=a");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
  });

  it("returns 400 when q is missing", async () => {
    const res = await app().request("/public/docs/search");
    expect(res.status).toBe(400);
  });

  it("returns empty results when nothing matches", async () => {
    const res = await app().request(
      "/public/docs/search?q=zzzznotpresentzzzz",
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toEqual([]);
  });

  it("caps results at 5", async () => {
    const many: DocEntry[] = Array.from({ length: 8 }, (_, i) => ({
      slug: `page-${i}`,
      title: `Page ${i}`,
      content: "widget widget widget",
    }));
    const res = await app(many).request("/public/docs/search?q=widget");
    const body = await res.json();
    expect(body.results).toHaveLength(5);
  });
});

describe("real generated corpus (search over the shipped docs)", () => {
  it("finds a widget term in the real corpus", async () => {
    // Uses the default (generated) corpus, not the synthetic one.
    const realApp = new Hono().route("/public", createDocsRoute());
    const res = await realApp.request("/public/docs/search?q=DeliveryChat.init");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results.length).toBeGreaterThanOrEqual(1);
  });
});
