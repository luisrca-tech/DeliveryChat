// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { useRef, useEffect } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getRoot, $createParagraphNode, $createTextNode, type LexicalEditor } from "lexical";
import { ClearEditorPlugin } from "../ClearEditorPlugin";

afterEach(() => {
  cleanup();
});

function getEditorConfig() {
  return {
    namespace: "test",
    nodes: [],
    onError: (error: Error) => { throw error; },
  };
}

type Harness = {
  clearRef: import("react").MutableRefObject<(() => void) | null>;
  editor: LexicalEditor;
};

function TestHarness({ onReady }: { onReady: (harness: Harness) => void }) {
  const clearRef = useRef<(() => void) | null>(null);
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const p = $createParagraphNode();
        p.append($createTextNode("hello world"));
        root.append(p);
      },
      { discrete: true },
    );

    onReady({ clearRef, editor });
  }, [editor, onReady]);

  return <ClearEditorPlugin clearRef={clearRef} />;
}

function getContent(editor: LexicalEditor): string {
  let text = "";
  editor.getEditorState().read(() => {
    text = $getRoot().getTextContent();
  });
  return text;
}

function renderWithEditor(onReady: (harness: Harness) => void) {
  return render(
    <LexicalComposer initialConfig={getEditorConfig()}>
      <RichTextPlugin
        contentEditable={<ContentEditable />}
        placeholder={null}
        ErrorBoundary={LexicalErrorBoundary}
      />
      <TestHarness onReady={onReady} />
    </LexicalComposer>,
  );
}

describe("ClearEditorPlugin", () => {
  it("assigns a clear function to clearRef", () => {
    let harness!: Harness;

    renderWithEditor((h) => { harness = h; });

    expect(harness.clearRef.current).toBeTypeOf("function");
  });

  it("clears editor content when clearRef is invoked", async () => {
    let harness!: Harness;

    renderWithEditor((h) => { harness = h; });

    expect(getContent(harness.editor)).toBe("hello world");

    await act(async () => {
      harness.clearRef.current!();
      await Promise.resolve();
    });

    expect(getContent(harness.editor).trim()).toBe("");
  });
});
