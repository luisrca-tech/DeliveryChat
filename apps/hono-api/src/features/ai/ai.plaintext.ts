import type { ContentFormat } from "@repo/types";

const FALLBACK_MAX_LENGTH = 500;

interface LexicalNode {
  type: string;
  children?: LexicalNode[];
  text?: string;
  [key: string]: unknown;
}

function extractText(node: LexicalNode): string {
  switch (node.type) {
    case "text":
    case "code-highlight":
      return node.text ?? "";

    case "linebreak":
      return "\n";

    case "root":
      return (node.children ?? []).map(extractText).join("");

    case "paragraph":
    case "heading":
    case "quote":
    case "code":
      return extractChildren(node);

    case "list":
      return (node.children ?? []).map(extractText).join("\n");

    case "listitem":
      return extractChildren(node);

    default:
      return extractChildren(node);
  }
}

function extractChildren(node: LexicalNode): string {
  return (node.children ?? []).map(extractText).join("");
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "...";
}

export function serializeLexicalToPlainText(
  content: string,
  contentFormat: ContentFormat,
): string {
  if (contentFormat === "plain") return content;
  if (!content) return "";

  try {
    const parsed = JSON.parse(content);

    if (!parsed?.root) {
      return truncate(content, FALLBACK_MAX_LENGTH);
    }

    const blocks = (parsed.root.children ?? []) as LexicalNode[];
    return blocks.map(extractText).join("\n");
  } catch {
    return truncate(content, FALLBACK_MAX_LENGTH);
  }
}
