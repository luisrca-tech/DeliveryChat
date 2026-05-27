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

function serializeNode(node: LexicalNode, insideCodeBlock = false): string {
  switch (node.type) {
    case "root":
      return (node.children ?? []).map((c) => serializeNode(c)).join("");

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
      const inner = (node.children ?? []).map((c) => serializeNode(c, true)).join("");
      return `<pre${lang}><code>${inner}</code></pre>`;
    }

    case "code-highlight":
    case "text": {
      const escaped = escapeHtml(node.text ?? "");
      if (insideCodeBlock) return escaped;
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
  return (node.children ?? []).map((c) => serializeNode(c)).join("");
}

export function serializeLexicalJsonToHtml(json: string): string | null {
  try {
    const parsed = JSON.parse(json);
    if (!parsed?.root) return `<p>${escapeHtml(json)}</p>`;
    return serializeNode(parsed.root);
  } catch {
    return `<p>${escapeHtml(json)}</p>`;
  }
}

export function isPlainTextLexicalJson(json: string): { plain: true; text: string } | { plain: false } {
  try {
    const parsed = JSON.parse(json);
    if (!parsed?.root?.children) return { plain: false };

    const children: LexicalNode[] = parsed.root.children;
    const textParts: string[] = [];

    for (const child of children) {
      if (child.type !== "paragraph") return { plain: false };

      const paragraphChildren = child.children ?? [];
      for (const node of paragraphChildren) {
        if (node.type === "linebreak") {
          continue;
        }
        if (node.type !== "text") return { plain: false };
        const format = typeof node.format === "number" ? node.format : 0;
        if (format !== 0) return { plain: false };
        textParts.push(node.text ?? "");
      }

      textParts.push("\n");
    }

    return { plain: true, text: textParts.join("").trim() };
  } catch {
    return { plain: false };
  }
}
