type MessageLike = {
  contentFormat?: "plain" | "lexical";
  content: string;
};

export function isLexicalMessage(msg: MessageLike): boolean {
  if (msg.contentFormat === "lexical") return true;
  if (msg.contentFormat === "plain") return false;
  return msg.content.trimStart().startsWith('{"root"');
}

export function resolveContentFormat(
  msg: MessageLike,
): "plain" | "lexical" {
  return isLexicalMessage(msg) ? "lexical" : "plain";
}
