import sanitizeHtml from "sanitize-html";

/**
 * Render the AI assistant's CONSTRAINED markdown subset to HTML.
 *
 * The autonomous prompt (MARKDOWN_FORMAT_INSTRUCTIONS) only permits **bold**,
 * #/##/### headings, bullet/numbered lists, and paragraphs — everything else
 * is already stripped by sanitizeAiMarkdown before the message is persisted.
 * This serializer turns exactly that subset into HTML so AI replies ride the
 * same server-sanitized `contentHtml` pipeline operators' rich messages use.
 *
 * Safety: the raw text is HTML-escaped BEFORE any markdown transformation, and
 * the final output is run through sanitize-html with a minimal allowlist as
 * defense in depth. Model output can never inject markup.
 */

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "strong", "h1", "h2", "h3", "ul", "ol", "li"],
  allowedAttributes: {},
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Inline pass: **bold** only — the sole inline construct the prompt allows. */
function renderInline(escapedLine: string): string {
  return escapedLine.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

const BULLET_RE = /^[-*] +(.*)$/;
const NUMBERED_RE = /^\d+\. +(.*)$/;
const HEADING_RE = /^(#{1,3}) +(.*)$/;

type LineKind = "bullet" | "numbered" | "heading" | "text";

function kindOf(line: string): LineKind {
  if (BULLET_RE.test(line)) return "bullet";
  if (NUMBERED_RE.test(line)) return "numbered";
  if (HEADING_RE.test(line)) return "heading";
  return "text";
}

/** Render one blank-line-delimited block, grouping runs of same-kind lines. */
function renderBlock(block: string): string {
  const lines = block.split("\n").filter((l) => l.trim() !== "");
  const parts: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!.trim();
    const kind = kindOf(line);

    if (kind === "heading") {
      const match = line.match(HEADING_RE)!;
      const level = match[1]!.length;
      parts.push(`<h${level}>${renderInline(match[2]!)}</h${level}>`);
      i++;
      continue;
    }

    if (kind === "bullet" || kind === "numbered") {
      const re = kind === "bullet" ? BULLET_RE : NUMBERED_RE;
      const tag = kind === "bullet" ? "ul" : "ol";
      const items: string[] = [];
      while (i < lines.length && kindOf(lines[i]!.trim()) === kind) {
        items.push(`<li>${renderInline(lines[i]!.trim().match(re)![1]!)}</li>`);
        i++;
      }
      parts.push(`<${tag}>${items.join("")}</${tag}>`);
      continue;
    }

    // Paragraph: consecutive text lines joined with <br>.
    const paraLines: string[] = [];
    while (i < lines.length && kindOf(lines[i]!.trim()) === "text") {
      paraLines.push(renderInline(lines[i]!.trim()));
      i++;
    }
    parts.push(`<p>${paraLines.join("<br>")}</p>`);
  }

  return parts.join("");
}

export function renderAiMarkdownToHtml(content: string): string | null {
  const trimmed = content.trim();
  if (trimmed === "") return null;

  const escaped = escapeHtml(trimmed);
  const html = escaped
    .split(/\n{2,}/)
    .map(renderBlock)
    .join("");

  return sanitizeHtml(html, SANITIZE_OPTIONS);
}
