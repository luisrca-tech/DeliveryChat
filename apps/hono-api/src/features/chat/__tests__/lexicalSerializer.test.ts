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

  it("serializes italic text", () => {
    const state = JSON.stringify({
      root: {
        children: [
          {
            children: [
              { format: 2, text: "italic text", type: "text", version: 1 },
            ],
            type: "paragraph",
            version: 1,
          },
        ],
        type: "root",
        version: 1,
      },
    });

    const result = serializeLexicalToHtml(state, "lexical");
    expect(result).toContain("<i>italic text</i>");
  });

  it("serializes underline text", () => {
    const state = JSON.stringify({
      root: {
        children: [
          {
            children: [
              { format: 8, text: "underlined", type: "text", version: 1 },
            ],
            type: "paragraph",
            version: 1,
          },
        ],
        type: "root",
        version: 1,
      },
    });

    const result = serializeLexicalToHtml(state, "lexical");
    expect(result).toContain("<u>underlined</u>");
  });

  it("serializes strikethrough text", () => {
    const state = JSON.stringify({
      root: {
        children: [
          {
            children: [
              { format: 4, text: "deleted", type: "text", version: 1 },
            ],
            type: "paragraph",
            version: 1,
          },
        ],
        type: "root",
        version: 1,
      },
    });

    const result = serializeLexicalToHtml(state, "lexical");
    expect(result).toContain("<s>deleted</s>");
  });

  it("serializes inline code", () => {
    const state = JSON.stringify({
      root: {
        children: [
          {
            children: [
              { format: 16, text: "const x = 1", type: "text", version: 1 },
            ],
            type: "paragraph",
            version: 1,
          },
        ],
        type: "root",
        version: 1,
      },
    });

    const result = serializeLexicalToHtml(state, "lexical");
    expect(result).toContain("<code>const x = 1</code>");
  });

  it("serializes combined formats (bold + italic)", () => {
    const state = JSON.stringify({
      root: {
        children: [
          {
            children: [
              { format: 3, text: "bold italic", type: "text", version: 1 },
            ],
            type: "paragraph",
            version: 1,
          },
        ],
        type: "root",
        version: 1,
      },
    });

    const result = serializeLexicalToHtml(state, "lexical");
    expect(result).toContain("<b>");
    expect(result).toContain("<i>");
    expect(result).toContain("bold italic");
  });

  it("serializes headings (h1, h2, h3)", () => {
    const state = JSON.stringify({
      root: {
        children: [
          {
            children: [{ format: 0, text: "Title", type: "text", version: 1 }],
            type: "heading",
            tag: "h1",
            version: 1,
          },
          {
            children: [{ format: 0, text: "Subtitle", type: "text", version: 1 }],
            type: "heading",
            tag: "h2",
            version: 1,
          },
          {
            children: [{ format: 0, text: "Section", type: "text", version: 1 }],
            type: "heading",
            tag: "h3",
            version: 1,
          },
        ],
        type: "root",
        version: 1,
      },
    });

    const result = serializeLexicalToHtml(state, "lexical");
    expect(result).toContain("<h1>Title</h1>");
    expect(result).toContain("<h2>Subtitle</h2>");
    expect(result).toContain("<h3>Section</h3>");
  });

  it("serializes bullet list", () => {
    const state = JSON.stringify({
      root: {
        children: [
          {
            type: "list",
            listType: "bullet",
            tag: "ul",
            version: 1,
            children: [
              {
                type: "listitem",
                version: 1,
                value: 1,
                children: [{ format: 0, text: "First item", type: "text", version: 1 }],
              },
              {
                type: "listitem",
                version: 1,
                value: 2,
                children: [{ format: 0, text: "Second item", type: "text", version: 1 }],
              },
            ],
          },
        ],
        type: "root",
        version: 1,
      },
    });

    const result = serializeLexicalToHtml(state, "lexical");
    expect(result).toContain("<ul>");
    expect(result).toContain("<li>First item</li>");
    expect(result).toContain("<li>Second item</li>");
    expect(result).toContain("</ul>");
  });

  it("serializes numbered list", () => {
    const state = JSON.stringify({
      root: {
        children: [
          {
            type: "list",
            listType: "number",
            tag: "ol",
            version: 1,
            children: [
              {
                type: "listitem",
                version: 1,
                value: 1,
                children: [{ format: 0, text: "Step one", type: "text", version: 1 }],
              },
              {
                type: "listitem",
                version: 1,
                value: 2,
                children: [{ format: 0, text: "Step two", type: "text", version: 1 }],
              },
            ],
          },
        ],
        type: "root",
        version: 1,
      },
    });

    const result = serializeLexicalToHtml(state, "lexical");
    expect(result).toContain("<ol>");
    expect(result).toContain("<li>Step one</li>");
    expect(result).toContain("<li>Step two</li>");
    expect(result).toContain("</ol>");
  });

  it("serializes code block without double code wrapping", () => {
    const state = JSON.stringify({
      root: {
        children: [
          {
            type: "code",
            version: 1,
            children: [
              { format: 16, text: "const x = 1;", type: "text", version: 1 },
              { type: "linebreak", version: 1 },
              { format: 16, text: "console.log(x);", type: "text", version: 1 },
            ],
          },
        ],
        type: "root",
        version: 1,
      },
    });

    const result = serializeLexicalToHtml(state, "lexical");
    expect(result).toContain("<pre>");
    expect(result).toContain("<code>");
    expect(result).toContain("const x = 1;");
    expect(result).not.toContain("<code><code>");
  });

  it("serializes code block with code-highlight nodes", () => {
    const state = JSON.stringify({
      root: {
        children: [
          {
            type: "code",
            language: "javascript",
            version: 1,
            children: [
              { format: 0, text: "function", type: "code-highlight", highlightType: "keyword", version: 1 },
              { format: 0, text: " hello() {}", type: "code-highlight", version: 1 },
            ],
          },
        ],
        type: "root",
        version: 1,
      },
    });

    const result = serializeLexicalToHtml(state, "lexical");
    expect(result).toContain('<pre class="language-javascript">');
    expect(result).toContain("function hello() {}");
    expect(result).not.toContain("<code><code>");
  });

  it("serializes link", () => {
    const state = JSON.stringify({
      root: {
        children: [
          {
            type: "paragraph",
            version: 1,
            children: [
              {
                type: "link",
                url: "https://example.com",
                target: "_blank",
                rel: "noopener noreferrer",
                version: 1,
                children: [
                  { format: 0, text: "Click here", type: "text", version: 1 },
                ],
              },
            ],
          },
        ],
        type: "root",
        version: 1,
      },
    });

    const result = serializeLexicalToHtml(state, "lexical");
    expect(result).toContain('<a href="https://example.com"');
    expect(result).toContain('target="_blank"');
    expect(result).toContain("Click here");
    expect(result).toContain("</a>");
  });

  it("serializes linebreaks", () => {
    const state = JSON.stringify({
      root: {
        children: [
          {
            type: "paragraph",
            version: 1,
            children: [
              { format: 0, text: "Line one", type: "text", version: 1 },
              { type: "linebreak", version: 1 },
              { format: 0, text: "Line two", type: "text", version: 1 },
            ],
          },
        ],
        type: "root",
        version: 1,
      },
    });

    const result = serializeLexicalToHtml(state, "lexical");
    expect(result).toMatch(/Line one<br\s*\/?>Line two/);
  });

  it("serializes mixed content (paragraph + heading + list)", () => {
    const state = JSON.stringify({
      root: {
        children: [
          {
            type: "heading",
            tag: "h2",
            version: 1,
            children: [{ format: 0, text: "Summary", type: "text", version: 1 }],
          },
          {
            type: "paragraph",
            version: 1,
            children: [
              { format: 0, text: "Here are the ", type: "text", version: 1 },
              { format: 1, text: "key points", type: "text", version: 1 },
              { format: 0, text: ":", type: "text", version: 1 },
            ],
          },
          {
            type: "list",
            listType: "bullet",
            version: 1,
            children: [
              {
                type: "listitem",
                version: 1,
                value: 1,
                children: [{ format: 0, text: "Point one", type: "text", version: 1 }],
              },
              {
                type: "listitem",
                version: 1,
                value: 2,
                children: [{ format: 0, text: "Point two", type: "text", version: 1 }],
              },
            ],
          },
        ],
        type: "root",
        version: 1,
      },
    });

    const result = serializeLexicalToHtml(state, "lexical");
    expect(result).toContain("<h2>Summary</h2>");
    expect(result).toContain("<b>key points</b>");
    expect(result).toContain("<ul>");
    expect(result).toContain("<li>Point one</li>");
  });
});
