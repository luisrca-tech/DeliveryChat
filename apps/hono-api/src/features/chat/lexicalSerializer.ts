import sanitizeHtml from "sanitize-html";
import type { ContentFormat } from "@repo/types";
import { serializeLexicalJsonToHtml } from "@repo/lexical-utils";

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
    "blockquote",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    span: ["class"],
    code: ["class"],
    pre: ["class"],
  },
  allowedSchemes: ["http", "https", "mailto"],
};

export function serializeLexicalToHtml(
  content: string,
  contentFormat: ContentFormat,
): string | null {
  if (contentFormat === "plain") {
    return null;
  }

  const rawHtml = serializeLexicalJsonToHtml(content);
  if (rawHtml === null) return null;

  return sanitizeHtml(rawHtml, SANITIZE_OPTIONS);
}
