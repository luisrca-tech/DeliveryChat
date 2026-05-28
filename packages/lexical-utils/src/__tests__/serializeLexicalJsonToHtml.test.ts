import { describe, it, expect } from "vitest";
import { serializeLexicalJsonToHtml } from "../index";

describe("serializeLexicalJsonToHtml", () => {
  it("serializes a simple paragraph", () => {
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

  it("serializes italic text", () => {
    const json = JSON.stringify({
      root: {
        children: [
          {
            type: "paragraph",
            children: [{ type: "text", text: "italic text", format: 2 }],
          },
        ],
        type: "root",
      },
    });

    expect(serializeLexicalJsonToHtml(json)).toContain("<i>italic text</i>");
  });

  it("serializes underline text", () => {
    const json = JSON.stringify({
      root: {
        children: [
          {
            type: "paragraph",
            children: [{ type: "text", text: "underlined", format: 8 }],
          },
        ],
        type: "root",
      },
    });

    expect(serializeLexicalJsonToHtml(json)).toContain("<u>underlined</u>");
  });

  it("serializes strikethrough text", () => {
    const json = JSON.stringify({
      root: {
        children: [
          {
            type: "paragraph",
            children: [{ type: "text", text: "deleted", format: 4 }],
          },
        ],
        type: "root",
      },
    });

    expect(serializeLexicalJsonToHtml(json)).toContain("<s>deleted</s>");
  });

  it("serializes inline code", () => {
    const json = JSON.stringify({
      root: {
        children: [
          {
            type: "paragraph",
            children: [{ type: "text", text: "const x = 1", format: 16 }],
          },
        ],
        type: "root",
      },
    });

    expect(serializeLexicalJsonToHtml(json)).toContain(
      "<code>const x = 1</code>",
    );
  });

  it("serializes combined formats (bold + italic)", () => {
    const json = JSON.stringify({
      root: {
        children: [
          {
            type: "paragraph",
            children: [{ type: "text", text: "both", format: 3 }],
          },
        ],
        type: "root",
      },
    });

    const html = serializeLexicalJsonToHtml(json)!;
    expect(html).toContain("<b>");
    expect(html).toContain("<i>");
    expect(html).toContain("both");
  });

  it("serializes headings (h1, h2, h3)", () => {
    const json = JSON.stringify({
      root: {
        children: [
          {
            type: "heading",
            tag: "h1",
            children: [{ type: "text", text: "Title", format: 0 }],
          },
          {
            type: "heading",
            tag: "h2",
            children: [{ type: "text", text: "Subtitle", format: 0 }],
          },
          {
            type: "heading",
            tag: "h3",
            children: [{ type: "text", text: "Section", format: 0 }],
          },
        ],
        type: "root",
      },
    });

    const html = serializeLexicalJsonToHtml(json)!;
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<h2>Subtitle</h2>");
    expect(html).toContain("<h3>Section</h3>");
  });

  it("serializes bullet list", () => {
    const json = JSON.stringify({
      root: {
        children: [
          {
            type: "list",
            listType: "bullet",
            children: [
              {
                type: "listitem",
                children: [{ type: "text", text: "First item", format: 0 }],
              },
              {
                type: "listitem",
                children: [{ type: "text", text: "Second item", format: 0 }],
              },
            ],
          },
        ],
        type: "root",
      },
    });

    expect(serializeLexicalJsonToHtml(json)).toBe(
      "<ul><li>First item</li><li>Second item</li></ul>",
    );
  });

  it("serializes numbered list", () => {
    const json = JSON.stringify({
      root: {
        children: [
          {
            type: "list",
            listType: "number",
            children: [
              {
                type: "listitem",
                children: [{ type: "text", text: "Step one", format: 0 }],
              },
              {
                type: "listitem",
                children: [{ type: "text", text: "Step two", format: 0 }],
              },
            ],
          },
        ],
        type: "root",
      },
    });

    const html = serializeLexicalJsonToHtml(json)!;
    expect(html).toContain("<ol>");
    expect(html).toContain("<li>Step one</li>");
    expect(html).toContain("<li>Step two</li>");
  });

  it("serializes code block without double code wrapping", () => {
    const json = JSON.stringify({
      root: {
        children: [
          {
            type: "code",
            children: [
              { type: "text", text: "const x = 1;", format: 16 },
              { type: "linebreak" },
              { type: "text", text: "console.log(x);", format: 16 },
            ],
          },
        ],
        type: "root",
      },
    });

    const html = serializeLexicalJsonToHtml(json)!;
    expect(html).toContain("<pre>");
    expect(html).toContain("<code>");
    expect(html).toContain("const x = 1;");
    expect(html).not.toContain("<code><code>");
  });

  it("serializes code block with code-highlight nodes and language", () => {
    const json = JSON.stringify({
      root: {
        children: [
          {
            type: "code",
            language: "javascript",
            children: [
              { type: "code-highlight", text: "function", format: 0 },
              { type: "code-highlight", text: " hello() {}", format: 0 },
            ],
          },
        ],
        type: "root",
      },
    });

    const html = serializeLexicalJsonToHtml(json)!;
    expect(html).toBe(
      '<pre class="language-javascript"><code>function hello() {}</code></pre>',
    );
  });

  it("serializes links with attributes", () => {
    const json = JSON.stringify({
      root: {
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
        type: "root",
      },
    });

    expect(serializeLexicalJsonToHtml(json)).toBe(
      '<p><a href="https://example.com" target="_blank" rel="noopener noreferrer">click me</a></p>',
    );
  });

  it("serializes linebreaks", () => {
    const json = JSON.stringify({
      root: {
        children: [
          {
            type: "paragraph",
            children: [
              { type: "text", text: "Line one", format: 0 },
              { type: "linebreak" },
              { type: "text", text: "Line two", format: 0 },
            ],
          },
        ],
        type: "root",
      },
    });

    expect(serializeLexicalJsonToHtml(json)).toBe(
      "<p>Line one<br>Line two</p>",
    );
  });

  it("serializes mixed content (heading + paragraph + list)", () => {
    const json = JSON.stringify({
      root: {
        children: [
          {
            type: "heading",
            tag: "h2",
            children: [{ type: "text", text: "Summary", format: 0 }],
          },
          {
            type: "paragraph",
            children: [
              { type: "text", text: "Here are the ", format: 0 },
              { type: "text", text: "key points", format: 1 },
              { type: "text", text: ":", format: 0 },
            ],
          },
          {
            type: "list",
            listType: "bullet",
            children: [
              {
                type: "listitem",
                children: [{ type: "text", text: "Point one", format: 0 }],
              },
            ],
          },
        ],
        type: "root",
      },
    });

    const html = serializeLexicalJsonToHtml(json)!;
    expect(html).toContain("<h2>Summary</h2>");
    expect(html).toContain("<b>key points</b>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>Point one</li>");
  });

  it("escapes HTML in text to prevent XSS", () => {
    const json = JSON.stringify({
      root: {
        children: [
          {
            type: "paragraph",
            children: [
              {
                type: "text",
                text: "<script>alert('xss')</script>",
                format: 0,
              },
            ],
          },
        ],
        type: "root",
      },
    });

    expect(serializeLexicalJsonToHtml(json)).toBe(
      "<p>&lt;script&gt;alert('xss')&lt;/script&gt;</p>",
    );
  });

  it("returns fallback HTML for invalid JSON", () => {
    expect(serializeLexicalJsonToHtml("not json")).toBe("<p>not json</p>");
  });

  it("returns fallback HTML for JSON without root", () => {
    expect(serializeLexicalJsonToHtml(JSON.stringify({}))).toBe("<p>{}</p>");
  });

  it("serializes blockquote", () => {
    const json = JSON.stringify({
      root: {
        children: [
          {
            type: "quote",
            children: [{ type: "text", text: "A quote", format: 0 }],
          },
        ],
        type: "root",
      },
    });

    expect(serializeLexicalJsonToHtml(json)).toBe(
      "<blockquote>A quote</blockquote>",
    );
  });

  it("serializes autolink nodes the same as link nodes", () => {
    const json = JSON.stringify({
      root: {
        children: [
          {
            type: "paragraph",
            children: [
              {
                type: "autolink",
                url: "https://auto.com",
                children: [{ type: "text", text: "auto link", format: 0 }],
              },
            ],
          },
        ],
        type: "root",
      },
    });

    expect(serializeLexicalJsonToHtml(json)).toBe(
      '<p><a href="https://auto.com">auto link</a></p>',
    );
  });
});
