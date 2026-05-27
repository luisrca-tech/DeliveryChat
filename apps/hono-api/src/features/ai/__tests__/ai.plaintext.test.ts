import { describe, it, expect } from "vitest";
import { serializeLexicalToPlainText } from "../ai.plaintext.js";

describe("serializeLexicalToPlainText", () => {
  it("passes through plain content as-is", () => {
    const result = serializeLexicalToPlainText("Hello world", "plain");
    expect(result).toBe("Hello world");
  });

  it("extracts text from valid Lexical JSON with a single paragraph", () => {
    const lexicalJson = JSON.stringify({
      root: {
        children: [
          {
            type: "paragraph",
            children: [{ type: "text", text: "Hello from Lexical" }],
          },
        ],
        type: "root",
      },
    });

    const result = serializeLexicalToPlainText(lexicalJson, "lexical");
    expect(result).toBe("Hello from Lexical");
  });

  it("extracts text from multiple paragraphs separated by newlines", () => {
    const lexicalJson = JSON.stringify({
      root: {
        children: [
          {
            type: "paragraph",
            children: [{ type: "text", text: "First paragraph" }],
          },
          {
            type: "paragraph",
            children: [{ type: "text", text: "Second paragraph" }],
          },
        ],
        type: "root",
      },
    });

    const result = serializeLexicalToPlainText(lexicalJson, "lexical");
    expect(result).toBe("First paragraph\nSecond paragraph");
  });

  it("strips formatting (bold, italic, etc.) and returns raw text", () => {
    const lexicalJson = JSON.stringify({
      root: {
        children: [
          {
            type: "paragraph",
            children: [
              { type: "text", text: "Normal " },
              { type: "text", text: "bold", format: 1 },
              { type: "text", text: " text" },
            ],
          },
        ],
        type: "root",
      },
    });

    const result = serializeLexicalToPlainText(lexicalJson, "lexical");
    expect(result).toBe("Normal bold text");
  });

  it("extracts text from headings", () => {
    const lexicalJson = JSON.stringify({
      root: {
        children: [
          {
            type: "heading",
            tag: "h2",
            children: [{ type: "text", text: "My Heading" }],
          },
          {
            type: "paragraph",
            children: [{ type: "text", text: "Body text" }],
          },
        ],
        type: "root",
      },
    });

    const result = serializeLexicalToPlainText(lexicalJson, "lexical");
    expect(result).toBe("My Heading\nBody text");
  });

  it("extracts text from list items", () => {
    const lexicalJson = JSON.stringify({
      root: {
        children: [
          {
            type: "list",
            listType: "bullet",
            children: [
              {
                type: "listitem",
                children: [{ type: "text", text: "Item one" }],
              },
              {
                type: "listitem",
                children: [{ type: "text", text: "Item two" }],
              },
            ],
          },
        ],
        type: "root",
      },
    });

    const result = serializeLexicalToPlainText(lexicalJson, "lexical");
    expect(result).toBe("Item one\nItem two");
  });

  it("handles linebreak nodes", () => {
    const lexicalJson = JSON.stringify({
      root: {
        children: [
          {
            type: "paragraph",
            children: [
              { type: "text", text: "Line one" },
              { type: "linebreak" },
              { type: "text", text: "Line two" },
            ],
          },
        ],
        type: "root",
      },
    });

    const result = serializeLexicalToPlainText(lexicalJson, "lexical");
    expect(result).toBe("Line one\nLine two");
  });

  it("returns truncated fallback for malformed JSON", () => {
    const result = serializeLexicalToPlainText("not valid json {{{", "lexical");
    expect(result).toBe("not valid json {{{");
  });

  it("returns truncated fallback for JSON without root node", () => {
    const result = serializeLexicalToPlainText(
      JSON.stringify({ something: "else" }),
      "lexical",
    );
    expect(result).toBe('{"something":"else"}');
  });

  it("truncates long fallback content to 500 characters", () => {
    const longText = "a".repeat(600);
    const result = serializeLexicalToPlainText(longText, "lexical");
    expect(result.length).toBe(503);
    expect(result).toMatch(/\.\.\.$/);
  });

  it("handles empty content string for lexical format", () => {
    const result = serializeLexicalToPlainText("", "lexical");
    expect(result).toBe("");
  });

  it("handles empty content string for plain format", () => {
    const result = serializeLexicalToPlainText("", "plain");
    expect(result).toBe("");
  });

  it("extracts text from link nodes", () => {
    const lexicalJson = JSON.stringify({
      root: {
        children: [
          {
            type: "paragraph",
            children: [
              { type: "text", text: "Visit " },
              {
                type: "link",
                url: "https://example.com",
                children: [{ type: "text", text: "our site" }],
              },
            ],
          },
        ],
        type: "root",
      },
    });

    const result = serializeLexicalToPlainText(lexicalJson, "lexical");
    expect(result).toBe("Visit our site");
  });
});
