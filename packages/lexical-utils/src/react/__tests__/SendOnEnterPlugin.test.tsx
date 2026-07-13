// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getRoot,
  $createParagraphNode,
  $createTextNode,
  KEY_ENTER_COMMAND,
  type LexicalEditor,
} from "lexical";
import { ListNode, ListItemNode } from "@lexical/list";
import { useEffect } from "react";
import { SendOnEnterPlugin } from "../SendOnEnterPlugin";
import type { ContentFormat } from "@repo/types";

afterEach(() => {
  cleanup();
});

function getEditorConfig() {
  return {
    namespace: "test",
    nodes: [ListNode, ListItemNode],
    onError: (error: Error) => {
      throw error;
    },
  };
}

function SetupEditor({
  text,
  onEditor,
}: {
  text: string;
  onEditor: (editor: LexicalEditor) => void;
}) {
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
    onEditor(editor);
  }, [editor, text, onEditor]);

  return null;
}

function renderWithEditor(
  onSend: (
    content: string,
    isEmpty: boolean,
    contentFormat: ContentFormat,
  ) => void,
  text = "hello",
) {
  let editorRef: LexicalEditor;

  render(
    <LexicalComposer initialConfig={getEditorConfig()}>
      <RichTextPlugin
        contentEditable={<ContentEditable />}
        placeholder={null}
        ErrorBoundary={LexicalErrorBoundary}
      />
      <SetupEditor
        text={text}
        onEditor={(e) => {
          editorRef = e;
        }}
      />
      <SendOnEnterPlugin onSend={onSend} />
    </LexicalComposer>,
  );

  return editorRef!;
}

function dispatchEnter(
  editor: LexicalEditor,
  modifiers: Partial<KeyboardEvent> = {},
) {
  act(() => {
    editor.dispatchCommand(KEY_ENTER_COMMAND, {
      preventDefault: vi.fn(),
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      shiftKey: false,
      ...modifiers,
    } as unknown as KeyboardEvent);
  });
}

describe("SendOnEnterPlugin", () => {
  it("calls onSend with plain format for plain text on Enter", () => {
    const onSend = vi.fn();
    const editor = renderWithEditor(onSend, "hello");

    dispatchEnter(editor);

    expect(onSend).toHaveBeenCalledOnce();
    expect(onSend).toHaveBeenCalledWith("hello", false, "plain");
  });

  it("does not call onSend when editor is empty", () => {
    const onSend = vi.fn();
    const editor = renderWithEditor(onSend, "");

    dispatchEnter(editor);

    expect(onSend).not.toHaveBeenCalled();
  });

  it("does not call onSend on Shift+Enter", () => {
    const onSend = vi.fn();
    const editor = renderWithEditor(onSend, "hello");

    dispatchEnter(editor, { shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
  });

  it("does not call onSend on Ctrl+Enter", () => {
    const onSend = vi.fn();
    const editor = renderWithEditor(onSend, "hello");

    dispatchEnter(editor, { ctrlKey: true });

    expect(onSend).not.toHaveBeenCalled();
  });

  it("does not call onSend on Meta+Enter", () => {
    const onSend = vi.fn();
    const editor = renderWithEditor(onSend, "hello");

    dispatchEnter(editor, { metaKey: true });

    expect(onSend).not.toHaveBeenCalled();
  });

  it("does not call onSend on Alt+Enter", () => {
    const onSend = vi.fn();
    const editor = renderWithEditor(onSend, "hello");

    dispatchEnter(editor, { altKey: true });

    expect(onSend).not.toHaveBeenCalled();
  });
});
