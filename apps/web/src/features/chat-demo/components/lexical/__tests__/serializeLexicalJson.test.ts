import { describe, it, expect } from "vitest";
import { isPlainTextLexicalJson, serializeLexicalJsonToHtml } from "../serializeLexicalJson";

describe("isPlainTextLexicalJson", () => {
  it("detects single plain text paragraph as plain", () => {
    const json = JSON.stringify({
      root: {
        children: [
          {
            type: "paragraph",
            children: [{ type: "text", text: "Hello world", format: 0 }],
          },
        ],
      },
    });
    const result = isPlainTextLexicalJson(json);
    expect(result).toEqual({ plain: true, text: "Hello world" });
  });

  it("detects multiple plain paragraphs as plain", () => {
    const json = JSON.stringify({
      root: {
        children: [
          {
            type: "paragraph",
            children: [{ type: "text", text: "Line 1", format: 0 }],
          },
          {
            type: "paragraph",
            children: [{ type: "text", text: "Line 2", format: 0 }],
          },
        ],
      },
    });
    const result = isPlainTextLexicalJson(json);
    expect(result).toEqual({ plain: true, text: "Line 1\nLine 2" });
  });

  it("returns not plain for bold text", () => {
    const json = JSON.stringify({
      root: {
        children: [
          {
            type: "paragraph",
            children: [{ type: "text", text: "bold", format: 1 }],
          },
        ],
      },
    });
    expect(isPlainTextLexicalJson(json)).toEqual({ plain: false });
  });

  it("returns not plain for heading nodes", () => {
    const json = JSON.stringify({
      root: {
        children: [
          {
            type: "heading",
            tag: "h1",
            children: [{ type: "text", text: "Title", format: 0 }],
          },
        ],
      },
    });
    expect(isPlainTextLexicalJson(json)).toEqual({ plain: false });
  });

  it("returns not plain for list nodes", () => {
    const json = JSON.stringify({
      root: {
        children: [
          {
            type: "list",
            listType: "bullet",
            children: [
              {
                type: "listitem",
                children: [{ type: "text", text: "item", format: 0 }],
              },
            ],
          },
        ],
      },
    });
    expect(isPlainTextLexicalJson(json)).toEqual({ plain: false });
  });

  it("returns not plain for link nodes", () => {
    const json = JSON.stringify({
      root: {
        children: [
          {
            type: "paragraph",
            children: [
              {
                type: "link",
                url: "https://example.com",
                children: [{ type: "text", text: "click", format: 0 }],
              },
            ],
          },
        ],
      },
    });
    expect(isPlainTextLexicalJson(json)).toEqual({ plain: false });
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
    const result = isPlainTextLexicalJson(json);
    expect(result).toEqual({ plain: true, text: "beforeafter" });
  });

  it("returns not plain for invalid JSON", () => {
    expect(isPlainTextLexicalJson("not json")).toEqual({ plain: false });
  });

  it("returns not plain when root has no children", () => {
    expect(isPlainTextLexicalJson(JSON.stringify({ root: {} }))).toEqual({
      plain: false,
    });
  });
});

describe("serializeLexicalJsonToHtml", () => {
  it("serializes paragraph with text", () => {
    const json = JSON.stringify({
      root: {
        type: "root",
        children: [
          {
            type: "paragraph",
            children: [{ type: "text", text: "Hello", format: 0 }],
          },
        ],
      },
    });
    expect(serializeLexicalJsonToHtml(json)).toBe("<p>Hello</p>");
  });

  it("wraps bold text in <b> tags", () => {
    const json = JSON.stringify({
      root: {
        type: "root",
        children: [
          {
            type: "paragraph",
            children: [{ type: "text", text: "bold", format: 1 }],
          },
        ],
      },
    });
    expect(serializeLexicalJsonToHtml(json)).toBe("<p><b>bold</b></p>");
  });

  it("serializes heading nodes", () => {
    const json = JSON.stringify({
      root: {
        type: "root",
        children: [
          {
            type: "heading",
            tag: "h2",
            children: [{ type: "text", text: "Title", format: 0 }],
          },
        ],
      },
    });
    expect(serializeLexicalJsonToHtml(json)).toBe("<h2>Title</h2>");
  });

  it("serializes bullet lists", () => {
    const json = JSON.stringify({
      root: {
        type: "root",
        children: [
          {
            type: "list",
            listType: "bullet",
            children: [
              {
                type: "listitem",
                children: [{ type: "text", text: "item", format: 0 }],
              },
            ],
          },
        ],
      },
    });
    expect(serializeLexicalJsonToHtml(json)).toBe(
      "<ul><li>item</li></ul>",
    );
  });

  it("serializes code blocks", () => {
    const json = JSON.stringify({
      root: {
        type: "root",
        children: [
          {
            type: "code",
            children: [{ type: "code-highlight", text: "const x = 1;" }],
          },
        ],
      },
    });
    expect(serializeLexicalJsonToHtml(json)).toBe(
      "<pre><code>const x = 1;</code></pre>",
    );
  });

  it("serializes links with attributes", () => {
    const json = JSON.stringify({
      root: {
        type: "root",
        children: [
          {
            type: "paragraph",
            children: [
              {
                type: "link",
                url: "https://example.com",
                target: "_blank",
                rel: "noopener noreferrer",
                children: [{ type: "text", text: "click me", format: 0 }],
              },
            ],
          },
        ],
      },
    });
    expect(serializeLexicalJsonToHtml(json)).toBe(
      '<p><a href="https://example.com" target="_blank" rel="noopener noreferrer">click me</a></p>',
    );
  });

  it("escapes HTML in text", () => {
    const json = JSON.stringify({
      root: {
        type: "root",
        children: [
          {
            type: "paragraph",
            children: [{ type: "text", text: "<script>alert(1)</script>", format: 0 }],
          },
        ],
      },
    });
    expect(serializeLexicalJsonToHtml(json)).toBe(
      "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
    );
  });

  it("falls back gracefully on invalid JSON", () => {
    expect(serializeLexicalJsonToHtml("just text")).toBe("<p>just text</p>");
  });

  it("wraps multiple formats on text", () => {
    const json = JSON.stringify({
      root: {
        type: "root",
        children: [
          {
            type: "paragraph",
            children: [{ type: "text", text: "both", format: 3 }],
          },
        ],
      },
    });
    const html = serializeLexicalJsonToHtml(json)!;
    expect(html).toContain("<b>");
    expect(html).toContain("<i>");
    expect(html).toContain("both");
  });
});
