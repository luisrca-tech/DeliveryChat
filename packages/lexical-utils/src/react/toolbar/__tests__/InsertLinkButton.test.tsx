// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, waitFor, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { LinkNode, AutoLinkNode } from "@lexical/link";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { InsertLinkButton } from "../InsertLinkButton";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

afterEach(() => {
  cleanup();
});

function InsertLinkButtonWithContext(props: { isLink: boolean }) {
  const [editor] = useLexicalComposerContext();
  return (
    <InsertLinkButton
      editor={editor}
      isLink={props.isLink}
      btnClass="btn"
      activeClass="active"
    />
  );
}

function renderWithEditor(isLink: boolean) {
  return render(
    <LexicalComposer
      initialConfig={{
        namespace: "test",
        nodes: [LinkNode, AutoLinkNode],
        onError: (error) => { throw error; },
      }}
    >
      <RichTextPlugin
        contentEditable={<ContentEditable />}
        placeholder={null}
        ErrorBoundary={LexicalErrorBoundary}
      />
      <LinkPlugin />
      <InsertLinkButtonWithContext isLink={isLink} />
    </LexicalComposer>,
  );
}

describe("InsertLinkButton", () => {
  it("renders insert link button when isLink is false", () => {
    const { container } = renderWithEditor(false);
    const view = within(container);
    expect(view.getByTitle("Insert link")).toBeDefined();
  });

  it("renders unlink button when isLink is true", () => {
    const { container } = renderWithEditor(true);
    const view = within(container);
    expect(view.getByTitle("Remove link")).toBeDefined();
  });

  it("applies active class when isLink is true", () => {
    const { container } = renderWithEditor(true);
    const view = within(container);
    const button = view.getByTitle("Remove link");
    expect(button.className).toContain("active");
  });

  it("opens popover on click and shows URL form", async () => {
    const user = userEvent.setup();
    const { container } = renderWithEditor(false);
    const view = within(container);

    await user.click(view.getByTitle("Insert link"));

    await waitFor(() => {
      expect(screen.getByLabelText("URL")).toBeDefined();
      expect(screen.getByText("Apply")).toBeDefined();
      expect(screen.getByText("Cancel")).toBeDefined();
    });
  });

  it("disables Apply button when URL input is empty", async () => {
    const user = userEvent.setup();
    const { container } = renderWithEditor(false);
    const view = within(container);

    await user.click(view.getByTitle("Insert link"));

    await waitFor(() => {
      const applyButton = screen.getByText("Apply");
      expect(applyButton.hasAttribute("disabled")).toBe(true);
    });
  });

  it("enables Apply button when URL is entered", async () => {
    const user = userEvent.setup();
    const { container } = renderWithEditor(false);
    const view = within(container);

    await user.click(view.getByTitle("Insert link"));

    await waitFor(() => {
      expect(screen.getByLabelText("URL")).toBeDefined();
    });

    await user.type(screen.getByLabelText("URL"), "https://example.com");

    const applyButton = screen.getByText("Apply");
    expect(applyButton.hasAttribute("disabled")).toBe(false);
  });

  it("closes popover on Cancel click", async () => {
    const user = userEvent.setup();
    const { container } = renderWithEditor(false);
    const view = within(container);

    await user.click(view.getByTitle("Insert link"));

    await waitFor(() => {
      expect(screen.getByText("Cancel")).toBeDefined();
    });

    await user.click(screen.getByText("Cancel"));

    await waitFor(() => {
      expect(screen.queryByLabelText("URL")).toBeNull();
    });
  });
});
