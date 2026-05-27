import { describe, expect, it } from "vitest";
import { isPlainTextLexicalJson, serializeLexicalJsonToHtml } from "./serializeLexicalJson";

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

    const result = isPlainTextLexicalJson(json);
    expect(result).toEqual({ plain: true, text: "Hello world" });
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

    const result = isPlainTextLexicalJson(json);
    expect(result).toEqual({ plain: true, text: "Line one\nLine two" });
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

    const result = isPlainTextLexicalJson(json);
    expect(result).toEqual({ plain: false });
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

    const result = isPlainTextLexicalJson(json);
    expect(result).toEqual({ plain: false });
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

    const result = isPlainTextLexicalJson(json);
    expect(result).toEqual({ plain: false });
  });

  it("detects links as not plain", () => {
    const json = JSON.stringify({
      root: {
        children: [
          {
            type: "paragraph",
            children: [
              { type: "link", url: "https://example.com", children: [{ type: "text", text: "link", format: 0 }] },
            ],
          },
        ],
        type: "root",
      },
    });

    const result = isPlainTextLexicalJson(json);
    expect(result).toEqual({ plain: false });
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

    const result = isPlainTextLexicalJson(json);
    expect(result).toEqual({ plain: true, text: "" });
  });
});

describe("serializeLexicalJsonToHtml", () => {
  it("serializes a simple paragraph", () => {
    const json = JSON.stringify({
      root: {
        children: [
          {
            type: "paragraph",
            children: [{ type: "text", text: "Hello", format: 0 }],
          },
        ],
        type: "root",
      },
    });

    expect(serializeLexicalJsonToHtml(json)).toBe("<p>Hello</p>");
  });

  it("serializes bold text", () => {
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

    expect(serializeLexicalJsonToHtml(json)).toBe("<p><b>Bold</b></p>");
  });

  it("serializes a heading", () => {
    const json = JSON.stringify({
      root: {
        children: [
          {
            type: "heading",
            tag: "h2",
            children: [{ type: "text", text: "Title", format: 0 }],
          },
        ],
        type: "root",
      },
    });

    expect(serializeLexicalJsonToHtml(json)).toBe("<h2>Title</h2>");
  });

  it("serializes a code block", () => {
    const json = JSON.stringify({
      root: {
        children: [
          {
            type: "code",
            language: "js",
            children: [{ type: "code-highlight", text: "const x = 1;", format: 0 }],
          },
        ],
        type: "root",
      },
    });

    expect(serializeLexicalJsonToHtml(json)).toBe('<pre class="language-js"><code>const x = 1;</code></pre>');
  });

  it("escapes HTML in text", () => {
    const json = JSON.stringify({
      root: {
        children: [
          {
            type: "paragraph",
            children: [{ type: "text", text: "<script>alert('xss')</script>", format: 0 }],
          },
        ],
        type: "root",
      },
    });

    expect(serializeLexicalJsonToHtml(json)).toBe("<p>&lt;script&gt;alert('xss')&lt;/script&gt;</p>");
  });

  it("returns fallback HTML for invalid JSON", () => {
    expect(serializeLexicalJsonToHtml("not json")).toBe("<p>not json</p>");
  });

  it("returns null for missing root", () => {
    expect(serializeLexicalJsonToHtml(JSON.stringify({}))).toBe("<p>{}</p>");
  });
});
