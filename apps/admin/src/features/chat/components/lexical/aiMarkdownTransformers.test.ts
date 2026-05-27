import { describe, it, expect } from "vitest";
import { createEditor, $getRoot, $createParagraphNode, $createTextNode } from "lexical";
import { HeadingNode } from "@lexical/rich-text";
import { ListNode, ListItemNode } from "@lexical/list";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
} from "@lexical/markdown";
import { AI_MARKDOWN_TRANSFORMERS } from "./aiMarkdownTransformers";

function roundTrip(markdown: string): string {
  const editor = createEditor({
    nodes: [HeadingNode, ListNode, ListItemNode],
    onError: (error) => {
      throw error;
    },
  });

  editor.update(
    () => {
      const root = $getRoot();
      root.clear();
      $convertFromMarkdownString(
        markdown,
        AI_MARKDOWN_TRANSFORMERS,
        root,
        true,
      );
    },
    { discrete: true },
  );

  let result = "";
  editor.getEditorState().read(() => {
    result = $convertToMarkdownString(AI_MARKDOWN_TRANSFORMERS);
  });
  return result;
}

describe("AI_MARKDOWN_TRANSFORMERS", () => {
  it("preserves bold text", () => {
    const result = roundTrip("Hello **world**");
    expect(result).toContain("**world**");
  });

  it("preserves h1 heading", () => {
    const result = roundTrip("# Title");
    expect(result).toContain("# Title");
  });

  it("preserves h2 heading", () => {
    const result = roundTrip("## Subtitle");
    expect(result).toContain("## Subtitle");
  });

  it("preserves h3 heading", () => {
    const result = roundTrip("### Section");
    expect(result).toContain("### Section");
  });

  it("preserves bullet list", () => {
    const result = roundTrip("- item one\n- item two");
    expect(result).toContain("- item one");
    expect(result).toContain("- item two");
  });

  it("preserves numbered list", () => {
    const result = roundTrip("1. first\n2. second");
    expect(result).toContain("1. first");
    expect(result).toContain("2. second");
  });

  it("preserves mixed content", () => {
    const md = "## Greeting\n\nHello **world**\n\n- one\n- two";
    const result = roundTrip(md);
    expect(result).toContain("## Greeting");
    expect(result).toContain("**world**");
    expect(result).toContain("- one");
  });

  it("handles empty string", () => {
    const result = roundTrip("");
    expect(result.trim()).toBe("");
  });

  it("passes plain text through unchanged", () => {
    const result = roundTrip("just some plain text");
    expect(result).toContain("just some plain text");
  });
});
