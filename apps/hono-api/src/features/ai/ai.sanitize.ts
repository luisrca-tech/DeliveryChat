export function sanitizeAiMarkdown(text: string): string {
  if (!text.trim()) return "";

  let result = text;

  // Strip HTML tags (including script/style with content)
  result = result.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  result = result.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  result = result.replace(/<[^>]+>/g, "");

  // Strip fenced code blocks (``` ... ```) but keep inner content
  result = result.replace(/^```[^\n]*\n?/gm, "");

  // Strip inline code backticks
  result = result.replace(/`([^`]*)`/g, "$1");

  // Strip link syntax [text](url) → keep text
  result = result.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");

  return result.trim();
}
