import { describe, it, expect } from "vitest";
import { isPlainTextLexicalJson } from "../index";

describe("isPlainTextLexicalJson", () => {
  it("detects simple text as plain", () => {
    const json = JSON.stringify({
      root: {
        children: [
          {
            type: "paragraph",
            children: [{ type: "text", text: "Hello world", format: 0 }],
          },
        ],
        type: "root",
      },
    });

    expect(isPlainTextLexicalJson(json)).toEqual({
      plain: true,
      text: "Hello world",
    });
  });

  it("detects multi-paragraph plain text", () => {
    const json = JSON.stringify({
      root: {
        children: [
          {
            type: "paragraph",
            children: [{ type: "text", text: "Line one", format: 0 }],
          },
          {
            type: "paragraph",
            children: [{ type: "text", text: "Line two", format: 0 }],
          },
        ],
        type: "root",
      },
    });

    expect(isPlainTextLexicalJson(json)).toEqual({
      plain: true,
      text: "Line one\nLine two",
    });
  });

  it("detects bold text as not plain", () => {
    const json = JSON.stringify({
      root: {
        children: [
          {
            type: "paragraph",
            children: [{ type: "text", text: "Bold", format: 1 }],
          },
        ],
        type: "root",
      },
    });

    expect(isPlainTextLexicalJson(json)).toEqual({ plain: false });
  });

  it("detects headings as not plain", () => {
    const json = JSON.stringify({
      root: {
        children: [
          {
            type: "heading",
            tag: "h1",
            children: [{ type: "text", text: "Title", format: 0 }],
          },
        ],
        type: "root",
      },
    });

    expect(isPlainTextLexicalJson(json)).toEqual({ plain: false });
  });

  it("detects lists as not plain", () => {
    const json = JSON.stringify({
      root: {
        children: [
          {
            type: "list",
            listType: "bullet",
            children: [
              {
                type: "listitem",
                children: [{ type: "text", text: "Item", format: 0 }],
              },
            ],
          },
        ],
        type: "root",
      },
    });

    expect(isPlainTextLexicalJson(json)).toEqual({ plain: false });
  });

  it("detects links as not plain", () => {
    const json = JSON.stringify({
      root: {
        children: [
          {
            type: "paragraph",
            children: [
              {
                type: "link",
                url: "https://example.com",
                children: [{ type: "text", text: "link", format: 0 }],
              },
            ],
          },
        ],
        type: "root",
      },
    });

    expect(isPlainTextLexicalJson(json)).toEqual({ plain: false });
  });

  it("returns not plain for invalid JSON", () => {
    expect(isPlainTextLexicalJson("not json")).toEqual({ plain: false });
  });

  it("handles empty paragraphs", () => {
    const json = JSON.stringify({
      root: {
        children: [{ type: "paragraph", children: [] }],
        type: "root",
      },
    });

    expect(isPlainTextLexicalJson(json)).toEqual({ plain: true, text: "" });
  });

  it("handles linebreaks in plain text paragraphs", () => {
    const json = JSON.stringify({
      root: {
        children: [
          {
            type: "paragraph",
            children: [
              { type: "text", text: "before", format: 0 },
              { type: "linebreak" },
              { type: "text", text: "after", format: 0 },
            ],
          },
        ],
      },
    });

    expect(isPlainTextLexicalJson(json)).toEqual({
      plain: true,
      text: "beforeafter",
    });
  });

  it("returns not plain when root has no children", () => {
    expect(isPlainTextLexicalJson(JSON.stringify({ root: {} }))).toEqual({
      plain: false,
    });
  });
});
