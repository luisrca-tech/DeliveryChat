import { describe, it, expect } from "vitest";
import { serializeLexicalToPlainText } from "../index";

describe("serializeLexicalToPlainText", () => {
  it("passes through plain content as-is", () => {
    expect(serializeLexicalToPlainText("Hello world", "plain")).toBe(
      "Hello world",
    );
  });

  it("extracts text from a single paragraph", () => {
    const json = JSON.stringify({
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

    expect(serializeLexicalToPlainText(json, "lexical")).toBe(
      "Hello from Lexical",
    );
  });

  it("extracts text from multiple paragraphs separated by newlines", () => {
    const json = JSON.stringify({
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

    expect(serializeLexicalToPlainText(json, "lexical")).toBe(
      "First paragraph\nSecond paragraph",
    );
  });

  it("strips formatting and returns raw text", () => {
    const json = JSON.stringify({
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

    expect(serializeLexicalToPlainText(json, "lexical")).toBe(
      "Normal bold text",
    );
  });

  it("extracts text from headings", () => {
    const json = JSON.stringify({
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

    expect(serializeLexicalToPlainText(json, "lexical")).toBe(
      "My Heading\nBody text",
    );
  });

  it("extracts text from list items", () => {
    const json = JSON.stringify({
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

    expect(serializeLexicalToPlainText(json, "lexical")).toBe(
      "Item one\nItem two",
    );
  });

  it("handles linebreak nodes", () => {
    const json = JSON.stringify({
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

    expect(serializeLexicalToPlainText(json, "lexical")).toBe(
      "Line one\nLine two",
    );
  });

  it("extracts text from link nodes", () => {
    const json = JSON.stringify({
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

    expect(serializeLexicalToPlainText(json, "lexical")).toBe("Visit our site");
  });

  it("returns truncated fallback for malformed JSON", () => {
    expect(serializeLexicalToPlainText("not valid json {{{", "lexical")).toBe(
      "not valid json {{{",
    );
  });

  it("returns truncated fallback for JSON without root", () => {
    expect(
      serializeLexicalToPlainText(
        JSON.stringify({ something: "else" }),
        "lexical",
      ),
    ).toBe('{"something":"else"}');
  });

  it("truncates long fallback content to 500 characters", () => {
    const longText = "a".repeat(600);
    const result = serializeLexicalToPlainText(longText, "lexical");
    expect(result.length).toBe(503);
    expect(result).toMatch(/\.\.\.$/);
  });

  it("handles empty content for lexical format", () => {
    expect(serializeLexicalToPlainText("", "lexical")).toBe("");
  });

  it("handles empty content for plain format", () => {
    expect(serializeLexicalToPlainText("", "plain")).toBe("");
  });
});
