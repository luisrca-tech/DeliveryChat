import { describe, it, expect } from "vitest";
import { renderAiMarkdownToHtml } from "../markdownSerializer.js";

describe("renderAiMarkdownToHtml", () => {
  it("renders **bold** inside a paragraph", () => {
    expect(renderAiMarkdownToHtml("The **Premium** plan")).toBe(
      "<p>The <strong>Premium</strong> plan</p>",
    );
  });

  it("renders headings at line start (h1–h3)", () => {
    expect(renderAiMarkdownToHtml("# Title")).toBe("<h1>Title</h1>");
    expect(renderAiMarkdownToHtml("## Sub")).toBe("<h2>Sub</h2>");
    expect(renderAiMarkdownToHtml("### Small")).toBe("<h3>Small</h3>");
  });

  it("renders - and * bullet lists", () => {
    expect(renderAiMarkdownToHtml("- one\n- two")).toBe(
      "<ul><li>one</li><li>two</li></ul>",
    );
    expect(renderAiMarkdownToHtml("* one\n* two")).toBe(
      "<ul><li>one</li><li>two</li></ul>",
    );
  });

  it("renders numbered lists", () => {
    expect(renderAiMarkdownToHtml("1. first\n2. second")).toBe(
      "<ol><li>first</li><li>second</li></ol>",
    );
  });

  it("splits paragraphs on blank lines and keeps single newlines as <br>", () => {
    expect(renderAiMarkdownToHtml("line one\nline two\n\nnext para")).toBe(
      // sanitize-html normalizes void tags to the self-closing form
      "<p>line one<br />line two</p><p>next para</p>",
    );
  });

  it("renders the mixed plan-answer shape from the QA runs", () => {
    const input =
      "**Free plan** - **Cost:** free (no charge)\n\n- **BRL:** R$ 90 per month\n- **USD:** $19 per month";
    expect(renderAiMarkdownToHtml(input)).toBe(
      "<p><strong>Free plan</strong> - <strong>Cost:</strong> free (no charge)</p>" +
        "<ul><li><strong>BRL:</strong> R$ 90 per month</li><li><strong>USD:</strong> $19 per month</li></ul>",
    );
  });

  it("escapes HTML so model output can never inject markup", () => {
    const result = renderAiMarkdownToHtml(
      '<script>alert("x")</script> & <b>hi</b>',
    );
    expect(result).not.toContain("<script");
    expect(result).not.toContain("<b>");
    expect(result).toContain("&amp;");
  });

  it("returns null for empty or whitespace-only input", () => {
    expect(renderAiMarkdownToHtml("")).toBeNull();
    expect(renderAiMarkdownToHtml("   \n  ")).toBeNull();
  });

  it("leaves unsupported markdown (italic, links already stripped upstream) as literal text", () => {
    expect(renderAiMarkdownToHtml("stay _literal_ here")).toBe(
      "<p>stay _literal_ here</p>",
    );
  });
});
