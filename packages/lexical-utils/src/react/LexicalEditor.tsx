import { useCallback, useEffect, useRef } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { HeadingNode } from "@lexical/rich-text";
import { ListNode, ListItemNode } from "@lexical/list";
import { CodeNode, CodeHighlightNode } from "@lexical/code";
import { LinkNode, AutoLinkNode } from "@lexical/link";
import {
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  COMMAND_PRIORITY_HIGH,
} from "lexical";
import { Check, X } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import type { ContentFormat } from "@repo/types";
import { editorTheme } from "./theme";
import { EXTERNAL_LINK_ATTRIBUTES } from "./linkInsert";
import { SendOnEnterPlugin } from "./SendOnEnterPlugin";
import { ListKeyboardPlugin } from "./ListKeyboardPlugin";
import { ClearEditorPlugin } from "./ClearEditorPlugin";
import { ExternalSendPlugin, type EditorHandle } from "./ExternalSendPlugin";
import { ToolbarPlugin, type AiToolbarProps } from "./toolbar";

const EDITOR_NODES = [
  HeadingNode,
  ListNode,
  ListItemNode,
  CodeNode,
  CodeHighlightNode,
  LinkNode,
  AutoLinkNode,
];

type ComposeProps = {
  mode?: "compose";
  onSend: (content: string, contentFormat: ContentFormat) => void;
  onTypingStart: () => void;
  onTypingStop: () => void;
  disabled?: boolean;
  placeholder?: string;
  editorHandleRef?: import("react").MutableRefObject<EditorHandle | null>;
  showToolbar?: boolean;
  ai?: AiToolbarProps;
  onChange?: () => void;
  contentClassName?: string;
};

type InlineProps = {
  mode: "inline";
  initialJson: string;
  onSave: (json: string) => void;
  onCancel: () => void;
};

export type LexicalEditorProps = ComposeProps | InlineProps;

const TYPING_THROTTLE_MS = 2_000;

export function LexicalEditor(props: LexicalEditorProps) {
  if (props.mode === "inline") {
    return <InlineEditor {...props} />;
  }
  return <ComposeEditor {...props} />;
}

function ComposeEditor({
  onSend,
  onTypingStart,
  onTypingStop,
  disabled = false,
  placeholder = "Type a message…",
  editorHandleRef,
  showToolbar = true,
  ai,
  onChange,
  contentClassName,
}: ComposeProps) {
  const lastTypingSentRef = useRef(0);
  const clearEditorRef = useRef<(() => void) | null>(null);

  const handleSend = useCallback(
    (content: string, isEmpty: boolean, contentFormat: ContentFormat) => {
      if (isEmpty || disabled) return;
      onSend(content, contentFormat);
      clearEditorRef.current?.();
      lastTypingSentRef.current = 0;
    },
    [onSend, disabled],
  );

  const initialConfig = {
    namespace: "LexicalEditor",
    theme: editorTheme,
    nodes: EDITOR_NODES,
    onError: (error: Error) => {
      console.error("Lexical error:", error);
    },
    editable: !disabled,
  };

  const contentEditableClass = [
    "lexical-editor-input min-h-[38px] max-h-[200px] overflow-y-auto px-3 py-2 outline-none",
    contentClassName,
  ]
    .filter(Boolean)
    .join(" ");

  const placeholderClass = [
    "absolute top-2 left-3 text-muted-foreground pointer-events-none select-none",
    contentClassName,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="flex-1 min-w-0 rounded-md border border-input bg-background text-sm ring-offset-background focus-within:ring-1 focus-within:ring-ring overflow-hidden">
        {showToolbar && <ToolbarPlugin ai={ai} />}
        <div className="relative">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className={contentEditableClass}
                onKeyUp={() => {
                  const now = Date.now();
                  if (now - lastTypingSentRef.current >= TYPING_THROTTLE_MS) {
                    lastTypingSentRef.current = now;
                    onTypingStart();
                  }
                }}
                onBlur={onTypingStop}
              />
            }
            placeholder={<div className={placeholderClass}>{placeholder}</div>}
            ErrorBoundary={LexicalErrorBoundary}
          />
        </div>
      </div>
      <HistoryPlugin />
      <ListPlugin />
      <LinkPlugin attributes={EXTERNAL_LINK_ATTRIBUTES} />
      {onChange && (
        <OnChangePlugin onChange={() => onChange()} ignoreSelectionChange />
      )}
      <SendOnEnterPlugin onSend={handleSend} />
      <ListKeyboardPlugin />
      <ClearEditorPlugin clearRef={clearEditorRef} />
      {editorHandleRef && (
        <ExternalSendPlugin
          onSend={handleSend}
          editorHandleRef={editorHandleRef}
        />
      )}
    </LexicalComposer>
  );
}

function InlineEditor({ initialJson, onSave, onCancel }: InlineProps) {
  const editorRef = useRef<{ getJson: () => string } | null>(null);

  const handleSave = useCallback(() => {
    const json = editorRef.current?.getJson();
    if (json) onSave(json);
  }, [onSave]);

  const editorState = parseEditorState(initialJson);

  const initialConfig = {
    namespace: "InlineEdit",
    theme: editorTheme,
    nodes: EDITOR_NODES,
    editorState: editorState ? JSON.stringify(editorState) : undefined,
    onError: (error: Error) => {
      console.error("Lexical inline edit error:", error);
    },
  };

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="flex flex-col gap-1.5">
        <div className="rounded-md border bg-background overflow-hidden">
          <RichTextPlugin
            contentEditable={
              <ContentEditable className="lexical-editor-input min-h-[36px] max-h-[120px] overflow-y-auto px-2 py-1.5 text-sm text-foreground outline-none" />
            }
            placeholder={null}
            ErrorBoundary={LexicalErrorBoundary}
          />
        </div>
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onCancel}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleSave}
          >
            <Check className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <HistoryPlugin />
      <ListPlugin />
      <LinkPlugin attributes={EXTERNAL_LINK_ATTRIBUTES} />
      <ListKeyboardPlugin interceptPlainEnter={false} />
      <InlineKeyboardPlugin onSave={handleSave} onCancel={onCancel} />
      <AutoFocusPlugin />
      <EditorRefPlugin editorRef={editorRef} />
    </LexicalComposer>
  );
}

function parseEditorState(json: string) {
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

function InlineKeyboardPlugin({
  onSave,
  onCancel,
}: {
  onSave: () => void;
  onCancel: () => void;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const unregisterEnter = editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event: KeyboardEvent | null) => {
        if (!event) return false;
        if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey)
          return false;
        event.preventDefault();
        onSave();
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );

    const unregisterEscape = editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      () => {
        onCancel();
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );

    return () => {
      unregisterEnter();
      unregisterEscape();
    };
  }, [editor, onSave, onCancel]);

  return null;
}

function AutoFocusPlugin() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    editor.focus();
  }, [editor]);
  return null;
}

function EditorRefPlugin({
  editorRef,
}: {
  editorRef: import("react").MutableRefObject<{ getJson: () => string } | null>;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editorRef.current = {
      getJson: () => JSON.stringify(editor.getEditorState().toJSON()),
    };
  }, [editor, editorRef]);

  return null;
}
