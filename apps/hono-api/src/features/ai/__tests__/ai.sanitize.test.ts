import { describe, it, expect } from "vitest";
import { sanitizeAiMarkdown } from "../ai.sanitize.js";

describe("sanitizeAiMarkdown", () => {
  describe("preserves allowed constructs", () => {
    it("preserves bold text", () => {
      expect(sanitizeAiMarkdown("This is **bold** text")).toBe(
        "This is **bold** text",
      );
    });

    it("preserves H1 headings", () => {
      expect(sanitizeAiMarkdown("# Main Heading\nSome text")).toBe(
        "# Main Heading\nSome text",
      );
    });

    it("preserves H2 and H3 headings", () => {
      const input = "## Section\n### Subsection\nContent";
      expect(sanitizeAiMarkdown(input)).toBe(input);
    });

    it("preserves bullet lists with -", () => {
      const input = "Items:\n- First\n- Second\n- Third";
      expect(sanitizeAiMarkdown(input)).toBe(input);
    });

    it("preserves bullet lists with *", () => {
      const input = "Items:\n* First\n* Second";
      expect(sanitizeAiMarkdown(input)).toBe(input);
    });

    it("preserves numbered lists", () => {
      const input = "Steps:\n1. First\n2. Second\n3. Third";
      expect(sanitizeAiMarkdown(input)).toBe(input);
    });

    it("preserves plain paragraphs", () => {
      const input = "First paragraph.\n\nSecond paragraph.";
      expect(sanitizeAiMarkdown(input)).toBe(input);
    });
  });

  describe("strips disallowed constructs", () => {
    it("strips HTML tags", () => {
      expect(sanitizeAiMarkdown("Hello <b>world</b>")).toBe("Hello world");
    });

    it("strips self-closing HTML tags", () => {
      expect(sanitizeAiMarkdown("Hello<br/>world")).toBe("Helloworld");
    });

    it("strips script tags and content", () => {
      expect(
        sanitizeAiMarkdown('Before<script>alert("xss")</script>After'),
      ).toBe("BeforeAfter");
    });

    it("strips fenced code blocks (```)", () => {
      const input = "Before\n```javascript\nconst x = 1;\n```\nAfter";
      expect(sanitizeAiMarkdown(input)).toBe("Before\nconst x = 1;\nAfter");
    });

    it("strips fenced code blocks without language", () => {
      const input = "Before\n```\nsome code\n```\nAfter";
      expect(sanitizeAiMarkdown(input)).toBe("Before\nsome code\nAfter");
    });

    it("strips link syntax [text](url)", () => {
      expect(sanitizeAiMarkdown("Visit [our site](https://example.com)")).toBe(
        "Visit our site",
      );
    });

    it("strips inline link references", () => {
      expect(sanitizeAiMarkdown("Check [this link](http://foo.com) out")).toBe(
        "Check this link out",
      );
    });

    it("strips inline code backticks", () => {
      expect(sanitizeAiMarkdown("Use the `console.log` function")).toBe(
        "Use the console.log function",
      );
    });
  });

  describe("edge cases", () => {
    it("returns empty string for empty input", () => {
      expect(sanitizeAiMarkdown("")).toBe("");
    });

    it("returns whitespace-only input trimmed", () => {
      expect(sanitizeAiMarkdown("   \n  ")).toBe("");
    });

    it("handles mixed allowed and disallowed content", () => {
      const input =
        "## Summary\n\n**Key points:**\n- First [link](url)\n- Second `code` item\n\n```\nblock\n```";
      const result = sanitizeAiMarkdown(input);
      expect(result).toContain("## Summary");
      expect(result).toContain("**Key points:**");
      expect(result).toContain("- First link");
      expect(result).toContain("- Second code item");
      expect(result).not.toContain("```");
      expect(result).not.toContain("[link](url)");
    });

    it("does not double-strip bold asterisks", () => {
      expect(sanitizeAiMarkdown("**bold** and * bullet")).toBe(
        "**bold** and * bullet",
      );
    });
  });
});
