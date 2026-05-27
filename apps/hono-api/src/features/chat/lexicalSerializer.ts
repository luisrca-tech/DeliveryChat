import sanitizeHtml from "sanitize-html";
import type { ContentFormat } from "@repo/types";

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "br",
    "b",
    "strong",
    "i",
    "em",
    "u",
    "s",
    "del",
    "code",
    "pre",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "ul",
    "ol",
    "li",
    "a",
    "span",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    span: ["class"],
    code: ["class"],
    pre: ["class"],
  },
  allowedSchemes: ["http", "https", "mailto"],
};

interface LexicalNode {
  type: string;
  children?: LexicalNode[];
  text?: string;
  format?: number | string;
  tag?: string;
  listType?: string;
  url?: string;
  target?: string;
  rel?: string;
  language?: string;
  version?: number;
  direction?: string | null;
  indent?: number;
  [key: string]: unknown;
}

const FORMAT_TAGS: Record<number, [string, string]> = {
  1: ["<b>", "</b>"],
  2: ["<i>", "</i>"],
  4: ["<s>", "</s>"],
  8: ["<u>", "</u>"],
  16: ["<code>", "</code>"],
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapWithFormats(text: string, format: number): string {
  let result = text;
  for (const [bit, [open, close]] of Object.entries(FORMAT_TAGS)) {
    if (format & Number(bit)) {
      result = `${open}${result}${close}`;
    }
  }
  return result;
}

function serializeNode(node: LexicalNode): string {
  switch (node.type) {
    case "root":
      return (node.children ?? []).map(serializeNode).join("");

    case "paragraph":
      return `<p>${serializeChildren(node)}</p>`;

    case "heading": {
      const tag = node.tag ?? "h1";
      return `<${tag}>${serializeChildren(node)}</${tag}>`;
    }

    case "list": {
      const tag = node.listType === "number" ? "ol" : "ul";
      return `<${tag}>${serializeChildren(node)}</${tag}>`;
    }

    case "listitem":
      return `<li>${serializeChildren(node)}</li>`;

    case "quote":
      return `<blockquote>${serializeChildren(node)}</blockquote>`;

    case "code": {
      const lang = node.language ? ` class="language-${escapeHtml(node.language)}"` : "";
      return `<pre${lang}><code>${serializeChildren(node)}</code></pre>`;
    }

    case "code-highlight":
    case "text": {
      const escaped = escapeHtml(node.text ?? "");
      const format = typeof node.format === "number" ? node.format : 0;
      return format ? wrapWithFormats(escaped, format) : escaped;
    }

    case "linebreak":
      return "<br>";

    case "link":
    case "autolink": {
      const href = node.url ? ` href="${escapeHtml(node.url)}"` : "";
      const target = node.target ? ` target="${escapeHtml(node.target)}"` : "";
      const rel = node.rel ? ` rel="${escapeHtml(node.rel)}"` : "";
      return `<a${href}${target}${rel}>${serializeChildren(node)}</a>`;
    }

    default:
      return serializeChildren(node);
  }
}

function serializeChildren(node: LexicalNode): string {
  return (node.children ?? []).map(serializeNode).join("");
}

export function serializeLexicalToHtml(
  content: string,
  contentFormat: ContentFormat,
): string | null {
  if (contentFormat === "plain") {
    return null;
  }

  try {
    const parsed = JSON.parse(content);

    if (!parsed?.root) {
      return sanitizeHtml(`<p>${escapeHtml(content)}</p>`, SANITIZE_OPTIONS);
    }

    const rawHtml = serializeNode(parsed.root);
    return sanitizeHtml(rawHtml, SANITIZE_OPTIONS);
  } catch {
    return sanitizeHtml(`<p>${escapeHtml(content)}</p>`, SANITIZE_OPTIONS);
  }
}
