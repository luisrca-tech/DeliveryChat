/**
 * Build-time snapshot of the Nextra docs (apps/docs/src/content/v1) into a
 * plain-text corpus that ships with hono-api.
 *
 * Why: the tenant AI dogfoods DeliveryChat's own docs via the public API
 * (`GET /api/v1/public/docs/*`). Fetching+parsing the deployed Next.js site at
 * runtime is fragile; instead we snapshot the MDX source (same monorepo) at
 * build time and commit the result. The API imports the JSON statically and
 * never depends on apps/docs existing at runtime.
 *
 * Wired into hono-api's `predev`/`prebuild`. Idempotent and fast. Path
 * resolution is relative to THIS file, so cwd does not matter.
 *
 * Output: src/generated/docsCorpus.json — Array<{ slug, title, description?, content }>.
 */
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(scriptDir, "..", "..", "docs", "src", "content", "v1");
const OUTPUT_DIR = join(scriptDir, "..", "src", "generated");
const OUTPUT_FILE = join(OUTPUT_DIR, "docsCorpus.json");

type DocEntry = {
  slug: string;
  title: string;
  description?: string;
  content: string;
};

/** Recursively collect all .mdx files under a directory. */
function collectMdxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectMdxFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".mdx")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Build an ordered lookup of slug -> { order, label } from every _meta.json.
 * Order is a flattened traversal of the nested _meta files so pages come out
 * in the same sequence the docs site navigation shows them.
 */
function buildMeta(dir: string): Map<string, { order: number; label: string }> {
  const meta = new Map<string, { order: number; label: string }>();
  let counter = 0;

  function slugForKey(prefix: string, key: string): string {
    if (key === "index") return prefix === "" ? "index" : prefix;
    return prefix === "" ? key : `${prefix}/${key}`;
  }

  function walk(currentDir: string, prefix: string): void {
    const metaPath = join(currentDir, "_meta.json");
    if (!existsSync(metaPath)) return;
    const parsed = JSON.parse(readFileSync(metaPath, "utf8")) as Record<
      string,
      string
    >;
    for (const [key, label] of Object.entries(parsed)) {
      const slug = slugForKey(prefix, key);
      meta.set(slug, { order: counter++, label });
      const childDir = join(currentDir, key);
      if (key !== "index" && existsSync(join(childDir, "_meta.json"))) {
        walk(childDir, slug);
      }
    }
  }

  walk(dir, "");
  return meta;
}

/** File path (relative to content dir) -> slug used by the API. */
function slugForFile(filePath: string): string {
  const rel = relative(CONTENT_DIR, filePath)
    .replace(/\\/g, "/")
    .replace(/\.mdx$/, "");
  if (rel === "index") return "index";
  if (rel.endsWith("/index")) return rel.slice(0, -"/index".length);
  return rel;
}

const FENCE_OPEN = "@@FENCE";
const FENCE_CLOSE = "@@";

/**
 * Strip MDX/JSX down to readable plain markdown. Intentionally simple and
 * lossy: fenced code blocks are preserved verbatim; frontmatter, imports,
 * exports, MDX comments and JSX component tags (their attributes included) are
 * removed, keeping any inner text between an open and close tag.
 */
function stripMdx(raw: string): string {
  let text = raw.replace(/\r\n/g, "\n");

  // Drop YAML frontmatter block if present.
  const frontmatter = text.match(/^---\n[\s\S]*?\n---\n/);
  if (frontmatter) text = text.slice(frontmatter[0].length);

  // Protect fenced code blocks so nothing inside them is stripped.
  const fences: string[] = [];
  text = text.replace(/```[\s\S]*?```/g, (match) => {
    fences.push(match);
    return `${FENCE_OPEN}${fences.length - 1}${FENCE_CLOSE}`;
  });

  // MDX comments {/* ... */}
  text = text.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  // Module-level import/export statements.
  text = text.replace(/^[ \t]*(import|export)[ \t][^\n]*$/gm, "");
  // JSX component tags (uppercase-led): open, close and self-closing, including
  // multi-line attribute blocks. Inner text between tags is kept.
  text = text.replace(/<\/?[A-Z][A-Za-z0-9]*\b[^>]*\/?>/g, "");

  // Restore fenced code blocks.
  text = text.replace(/@@FENCE(\d+)@@/g, (_, i) => fences[Number(i)] ?? "");

  // Collapse excess blank lines left behind by removed tags.
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

function extractTitle(content: string, fallback: string): string {
  const heading = content.match(/^#\s+(.+)$/m);
  return heading ? heading[1].trim() : fallback;
}

function extractDescription(content: string): string | undefined {
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("```")) continue;
    const clean = trimmed.replace(/[*_`]/g, "");
    return clean.length > 200 ? `${clean.slice(0, 197)}...` : clean;
  }
  return undefined;
}

function main(): void {
  if (!existsSync(CONTENT_DIR)) {
    console.warn(
      `[generate-docs-corpus] content dir not found (${CONTENT_DIR}); keeping existing corpus.`,
    );
    return;
  }

  const meta = buildMeta(CONTENT_DIR);
  const files = collectMdxFiles(CONTENT_DIR);

  const entries: DocEntry[] = files.map((filePath) => {
    const slug = slugForFile(filePath);
    const raw = readFileSync(filePath, "utf8");
    const content = stripMdx(raw);
    const metaLabel = meta.get(slug)?.label ?? slug;
    const title = extractTitle(content, metaLabel);
    const description = extractDescription(content);
    return description
      ? { slug, title, description, content }
      : { slug, title, content };
  });

  entries.sort((a, b) => {
    const orderA = meta.get(a.slug)?.order ?? Number.MAX_SAFE_INTEGER;
    const orderB = meta.get(b.slug)?.order ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return a.slug.localeCompare(b.slug);
  });

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_FILE, `${JSON.stringify(entries, null, 2)}\n`, "utf8");

  const bytes = Buffer.byteLength(JSON.stringify(entries));
  console.log(
    `[generate-docs-corpus] wrote ${entries.length} pages (${bytes} bytes) to ${OUTPUT_FILE}`,
  );
}

main();
