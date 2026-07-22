import { describe, it, expect } from "vitest";
import corpus from "../../../generated/docsCorpus.json" with { type: "json" };

type DocEntry = {
  slug: string;
  title: string;
  description?: string;
  content: string;
};

describe("generated docs corpus", () => {
  const entries = corpus as DocEntry[];

  it("exists and is non-empty", () => {
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThan(0);
  });

  it("every entry has a non-empty slug, title and content", () => {
    for (const entry of entries) {
      expect(typeof entry.slug).toBe("string");
      expect(entry.slug.length).toBeGreaterThan(0);
      expect(typeof entry.title).toBe("string");
      expect(entry.title.length).toBeGreaterThan(0);
      expect(typeof entry.content).toBe("string");
      expect(entry.content.length).toBeGreaterThan(0);
    }
  });

  it("includes the ai-assistant pages", () => {
    const slugs = entries.map((e) => e.slug);
    expect(slugs).toContain("ai-assistant");
    expect(slugs).toContain("ai-assistant/configuration");
  });

  it("has unique slugs", () => {
    const slugs = entries.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
