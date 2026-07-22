// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { useRef, useEffect } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getRoot, $createParagraphNode, $createTextNode } from "lexical";
import { HeadingNode } from "@lexical/rich-text";
import { ListNode, ListItemNode } from "@lexical/list";
import { ExternalSendPlugin, type EditorHandle } from "../ExternalSendPlugin";
import type { ContentFormat } from "@repo/types";

afterEach(() => {
  cleanup();
});

function getEditorConfig() {
  return {
    namespace: "test",
    nodes: [HeadingNode, ListNode, ListItemNode],
    onError: (error: Error) => {
      throw error;
    },
  };
}

type Harness = {
  handle: import("react").MutableRefObject<EditorHandle | null>;
};

function TestHarness({
  onSend,
  text,
  onReady,
}: {
  onSend: (
    content: string,
    isEmpty: boolean,
    contentFormat: ContentFormat,
  ) => void;
  text: string;
  onReady: (harness: Harness) => void;
}) {
  const handleRef = useRef<EditorHandle | null>(null);
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (text) {
      editor.update(
        () => {
          const root = $getRoot();
          root.clear();
          const p = $createParagraphNode();
          p.append($createTextNode(text));
          root.append(p);
        },
        { discrete: true },
      );
    }
    onReady({ handle: handleRef });
  }, [editor, text, onReady]);

  return <ExternalSendPlugin onSend={onSend} editorHandleRef={handleRef} />;
}

function renderWithEditor(
  onSend: (
    content: string,
    isEmpty: boolean,
    contentFormat: ContentFormat,
  ) => void,
  text = "hello",
) {
  let harness!: Harness;

  render(
    <LexicalComposer initialConfig={getEditorConfig()}>
      <RichTextPlugin
        contentEditable={<ContentEditable />}
        placeholder={null}
        ErrorBoundary={LexicalErrorBoundary}
      />
      <TestHarness
        onSend={onSend}
        text={text}
        onReady={(h) => {
          harness = h;
        }}
      />
    </LexicalComposer>,
  );

  return harness;
}

describe("ExternalSendPlugin", () => {
  it("exposes triggerSend on the editor handle ref", () => {
    const onSend = vi.fn();
    const harness = renderWithEditor(onSend);

    expect(harness.handle.current).not.toBeNull();
    expect(harness.handle.current!.triggerSend).toBeTypeOf("function");
  });

  it("triggerSend calls onSend with plain format for plain text", () => {
    const onSend = vi.fn();
    const harness = renderWithEditor(onSend, "hello");

    act(() => {
      harness.handle.current!.triggerSend();
    });

    expect(onSend).toHaveBeenCalledOnce();
    expect(onSend).toHaveBeenCalledWith("hello", false, "plain");
  });

  it("triggerSend calls onSend with isEmpty true when editor is empty", () => {
    const onSend = vi.fn();
    const harness = renderWithEditor(onSend, "");

    act(() => {
      harness.handle.current!.triggerSend();
    });

    expect(onSend).toHaveBeenCalledWith("", true, "plain");
  });

  it("isEmpty returns true for empty editor", () => {
    const onSend = vi.fn();
    const harness = renderWithEditor(onSend, "");

    expect(harness.handle.current!.isEmpty()).toBe(true);
  });

  it("isEmpty returns false for editor with content", () => {
    const onSend = vi.fn();
    const harness = renderWithEditor(onSend, "hello");

    expect(harness.handle.current!.isEmpty()).toBe(false);
  });

  it("insertAiMarkdown populates editor with markdown content", async () => {
    const onSend = vi.fn();
    const harness = renderWithEditor(onSend, "");

    await act(async () => {
      harness.handle.current!.insertAiMarkdown("**bold text**");
      await Promise.resolve();
    });

    expect(harness.handle.current!.isEmpty()).toBe(false);
  });

  it("exportMarkdown returns markdown string", async () => {
    const onSend = vi.fn();
    const harness = renderWithEditor(onSend, "");

    await act(async () => {
      harness.handle.current!.insertAiMarkdown("**bold text**");
      await Promise.resolve();
    });

    const md = harness.handle.current!.exportMarkdown();
    expect(md).toContain("**bold text**");
  });
});
