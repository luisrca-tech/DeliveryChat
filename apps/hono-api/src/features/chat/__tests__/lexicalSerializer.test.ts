import { describe, it, expect } from "vitest";
import { serializeLexicalToHtml } from "../lexicalSerializer";

describe("serializeLexicalToHtml", () => {
  it("returns null for plain format", () => {
    const result = serializeLexicalToHtml("Hello world", "plain");
    expect(result).toBeNull();
  });

  it("serializes valid Lexical JSON to HTML", () => {
    const lexicalState = JSON.stringify({
      root: {
        children: [
          {
            children: [
              {
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                text: "Hello world",
                type: "text",
                version: 1,
              },
            ],
            direction: "ltr",
            format: "",
            indent: 0,
            type: "paragraph",
            version: 1,
            textFormat: 0,
            textStyle: "",
          },
        ],
        direction: "ltr",
        format: "",
        indent: 0,
        type: "root",
        version: 1,
      },
    });

    const result = serializeLexicalToHtml(lexicalState, "lexical");
    expect(result).not.toBeNull();
    expect(result).toContain("Hello world");
    expect(result).toContain("<p");
  });

  it("returns fallback HTML for malformed JSON", () => {
    const result = serializeLexicalToHtml("not valid json {{{", "lexical");
    expect(result).not.toBeNull();
    expect(result).toContain("not valid json");
  });

  it("returns fallback HTML for invalid Lexical structure", () => {
    const invalidState = JSON.stringify({ root: { children: [] } });
    const result = serializeLexicalToHtml(invalidState, "lexical");
    expect(result).not.toBeNull();
  });

  it("strips XSS payloads from generated HTML", () => {
    const xssState = JSON.stringify({
      root: {
        children: [
          {
            children: [
              {
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                text: '<script>alert("xss")</script>',
                type: "text",
                version: 1,
              },
            ],
            direction: "ltr",
            format: "",
            indent: 0,
            type: "paragraph",
            version: 1,
            textFormat: 0,
            textStyle: "",
          },
        ],
        direction: "ltr",
        format: "",
        indent: 0,
        type: "root",
        version: 1,
      },
    });

    const result = serializeLexicalToHtml(xssState, "lexical");
    expect(result).not.toBeNull();
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("</script>");
  });

  it("serializes bold text", () => {
    const state = JSON.stringify({
      root: {
        children: [
          {
            children: [
              {
                detail: 0,
                format: 1,
                mode: "normal",
                style: "",
                text: "bold text",
                type: "text",
                version: 1,
              },
            ],
            direction: "ltr",
            format: "",
            indent: 0,
            type: "paragraph",
            version: 1,
            textFormat: 0,
            textStyle: "",
          },
        ],
        direction: "ltr",
        format: "",
        indent: 0,
        type: "root",
        version: 1,
      },
    });

    const result = serializeLexicalToHtml(state, "lexical");
    expect(result).not.toBeNull();
    expect(result).toContain("<b>");
    expect(result).toContain("bold text");
  });
});
