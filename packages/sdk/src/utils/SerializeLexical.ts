type LexicalNode = {
  type?: string;
  text?: string;
  children?: LexicalNode[];
};

type LexicalRoot = {
  root?: { children?: LexicalNode[] };
};

function extractText(node: LexicalNode): string {
  if (node.type === "linebreak") return "\n";
  if (node.type === "text") return node.text ?? "";

  const children = node.children ?? [];
  const childText = children.map(extractText).join("");

  if (node.type === "list") {
    return children.map(extractText).join("\n");
  }

  return childText;
}

export function serializeLexicalToPlainText(json: string): string {
  let parsed: LexicalRoot;
  try {
    parsed = JSON.parse(json) as LexicalRoot;
  } catch {
    return json;
  }

  if (!parsed.root?.children) return json;

  return parsed.root.children.map(extractText).join("\n");
}
