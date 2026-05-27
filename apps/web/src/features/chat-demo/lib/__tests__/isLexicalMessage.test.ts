import { describe, it, expect } from "vitest";
import { isLexicalMessage, resolveContentFormat } from "../isLexicalMessage";

describe("isLexicalMessage", () => {
  it("returns true when contentFormat is lexical", () => {
    expect(
      isLexicalMessage({ contentFormat: "lexical", content: "hello" }),
    ).toBe(true);
  });

  it("returns false when contentFormat is plain", () => {
    expect(
      isLexicalMessage({
        contentFormat: "plain",
        content: '{"root":{"children":[]}}',
      }),
    ).toBe(false);
  });

  it("detects lexical JSON when contentFormat is missing", () => {
    expect(
      isLexicalMessage({
        content: '{"root":{"children":[{"type":"paragraph"}]}}',
      }),
    ).toBe(true);
  });

  it("resolveContentFormat defaults missing format from content", () => {
    expect(
      resolveContentFormat({
        content: '{"root":{"children":[]}}',
      }),
    ).toBe("lexical");
  });
});
