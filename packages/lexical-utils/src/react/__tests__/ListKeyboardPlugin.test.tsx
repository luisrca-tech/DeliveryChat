// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { useEffect } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getRoot,
  $createParagraphNode,
  $createTextNode,
  KEY_ENTER_COMMAND,
  INSERT_LINE_BREAK_COMMAND,
  COMMAND_PRIORITY_LOW,
  type LexicalEditor,
} from "lexical";
import {
  ListNode,
  ListItemNode,
  $createListNode,
  $createListItemNode,
} from "@lexical/list";
import { ListKeyboardPlugin } from "../ListKeyboardPlugin";

afterEach(() => {
  cleanup();
});

function getEditorConfig() {
  return {
    namespace: "test",
    nodes: [ListNode, ListItemNode],
    onError: (error: Error) => { throw error; },
  };
}

function SetupEditor({
  setup,
  onEditor,
}: {
  setup: "list" | "paragraph";
  onEditor: (editor: LexicalEditor) => void;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        if (setup === "list") {
          const list = $createListNode("bullet");
          const item = $createListItemNode();
          item.append($createTextNode("item one"));
          list.append(item);
          root.append(list);
          item.selectEnd();
        } else {
          const p = $createParagraphNode();
          p.append($createTextNode("paragraph"));
          root.append(p);
          p.selectEnd();
        }
      },
      { discrete: true },
    );
    onEditor(editor);
  }, [editor, setup, onEditor]);

  return null;
}

function renderWithEditor(
  setup: "list" | "paragraph",
  interceptPlainEnter = true,
) {
  let editorRef!: LexicalEditor;

  render(
    <LexicalComposer initialConfig={getEditorConfig()}>
      <RichTextPlugin
        contentEditable={<ContentEditable />}
        placeholder={null}
        ErrorBoundary={LexicalErrorBoundary}
      />
      <ListPlugin />
      <SetupEditor setup={setup} onEditor={(e) => { editorRef = e; }} />
      <ListKeyboardPlugin interceptPlainEnter={interceptPlainEnter} />
    </LexicalComposer>,
  );

  return editorRef;
}

function getTextContent(editor: LexicalEditor): string {
  let text = "";
  editor.getEditorState().read(() => {
    text = $getRoot().getTextContent();
  });
  return text;
}

function dispatchEnter(editor: LexicalEditor, modifiers: Partial<KeyboardEvent> = {}) {
  return act(() => {
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

describe("ListKeyboardPlugin", () => {
  it("handles Ctrl+Enter inside a list by inserting a new list item", async () => {
    const editor = renderWithEditor("list");

    await dispatchEnter(editor, { ctrlKey: true });

    const text = getTextContent(editor);
    expect(text).toContain("item one");
  });

  it("handles Ctrl+Enter outside a list by inserting a line break", async () => {
    const editor = renderWithEditor("paragraph");
    const lineBreakSpy = vi.fn(() => true);

    editor.registerCommand(INSERT_LINE_BREAK_COMMAND, lineBreakSpy, COMMAND_PRIORITY_LOW);

    await dispatchEnter(editor, { ctrlKey: true });

    expect(lineBreakSpy).toHaveBeenCalled();
  });

  it("does not intercept Shift+Enter", () => {
    const editor = renderWithEditor("list");

    const result = act(() => {
      return editor.dispatchCommand(KEY_ENTER_COMMAND, {
        preventDefault: vi.fn(),
        ctrlKey: false,
        altKey: false,
        metaKey: false,
        shiftKey: true,
      } as unknown as KeyboardEvent);
    });

    expect(getTextContent(editor)).toContain("item one");
  });

  it("intercepts plain Enter inside a list when interceptPlainEnter is true", async () => {
    const editor = renderWithEditor("list", true);

    await dispatchEnter(editor);

    expect(getTextContent(editor)).toContain("item one");
  });

  it("does not intercept plain Enter inside a list when interceptPlainEnter is false", () => {
    const editor = renderWithEditor("list", false);

    dispatchEnter(editor);

    expect(getTextContent(editor)).toContain("item one");
  });
});
