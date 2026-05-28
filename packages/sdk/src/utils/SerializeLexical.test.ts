import { describe, expect, it } from "vitest";
import { serializeLexicalToPlainText } from "./SerializeLexical.js";

describe("serializeLexicalToPlainText", () => {
  it("extracts text from a single paragraph", () => {
    const json = JSON.stringify({
      root: {
        children: [
          {
            type: "paragraph",
            children: [{ type: "text", text: "Hello world" }],
          },
        ],
      },
    });
    expect(serializeLexicalToPlainText(json)).toBe("Hello world");
  });

  it("separates multiple paragraphs with newlines", () => {
    const json = JSON.stringify({
      root: {
        children: [
          {
            type: "paragraph",
            children: [{ type: "text", text: "First" }],
          },
          {
            type: "paragraph",
            children: [{ type: "text", text: "Second" }],
          },
        ],
      },
    });
    expect(serializeLexicalToPlainText(json)).toBe("First\nSecond");
  });

  it("extracts text from link nodes", () => {
    const json = JSON.stringify({
      root: {
        children: [
          {
            type: "paragraph",
            children: [
              { type: "text", text: "Click " },
              {
                type: "link",
                children: [{ type: "text", text: "here" }],
              },
              { type: "text", text: " please" },
            ],
          },
        ],
      },
    });
    expect(serializeLexicalToPlainText(json)).toBe("Click here please");
  });

  it("converts linebreak nodes to newlines", () => {
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
      },
    });
    expect(serializeLexicalToPlainText(json)).toBe("Line one\nLine two");
  });

  it("extracts text from heading nodes", () => {
    const json = JSON.stringify({
      root: {
        children: [
          {
            type: "heading",
            children: [{ type: "text", text: "Title" }],
          },
          {
            type: "paragraph",
            children: [{ type: "text", text: "Body" }],
          },
        ],
      },
    });
    expect(serializeLexicalToPlainText(json)).toBe("Title\nBody");
  });

  it("extracts text from nested list items", () => {
    const json = JSON.stringify({
      root: {
        children: [
          {
            type: "list",
            children: [
              {
                type: "listitem",
                children: [{ type: "text", text: "Item A" }],
              },
              {
                type: "listitem",
                children: [{ type: "text", text: "Item B" }],
              },
            ],
          },
        ],
      },
    });
    expect(serializeLexicalToPlainText(json)).toBe("Item A\nItem B");
  });

  it("returns raw string for invalid JSON", () => {
    expect(serializeLexicalToPlainText("not json")).toBe("not json");
  });

  it("returns raw string for JSON without root", () => {
    expect(serializeLexicalToPlainText(JSON.stringify({ foo: "bar" }))).toBe(
      JSON.stringify({ foo: "bar" }),
    );
  });

  it("returns empty string for empty root children", () => {
    const json = JSON.stringify({ root: { children: [] } });
    expect(serializeLexicalToPlainText(json)).toBe("");
  });

  it("handles nodes with no children gracefully", () => {
    const json = JSON.stringify({
      root: {
        children: [
          { type: "paragraph" },
          {
            type: "paragraph",
            children: [{ type: "text", text: "After empty" }],
          },
        ],
      },
    });
    expect(serializeLexicalToPlainText(json)).toBe("\nAfter empty");
  });
});
