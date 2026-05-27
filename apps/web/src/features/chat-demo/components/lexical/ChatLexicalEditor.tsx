import { useCallback, useRef } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HeadingNode } from "@lexical/rich-text";
import { ListNode, ListItemNode } from "@lexical/list";
import { CodeNode, CodeHighlightNode } from "@lexical/code";
import { LinkNode, AutoLinkNode } from "@lexical/link";
import {
  EXTERNAL_LINK_ATTRIBUTES,
  editorTheme,
  SendOnEnterPlugin,
  ListKeyboardPlugin,
  ClearEditorPlugin,
  ExternalSendPlugin,
  type EditorHandle,
} from "@repo/lexical-utils/react";
import { ToolbarPlugin } from "@repo/lexical-utils/react";
import type { ContentFormat } from "@repo/types";

type Props = {
  onSend: (content: string, contentFormat: ContentFormat) => void;
  onTypingStart: () => void;
  onTypingStop: () => void;
  disabled: boolean;
  editorHandleRef: React.MutableRefObject<EditorHandle | null>;
};

const EDITOR_NODES = [
  HeadingNode,
  ListNode,
  ListItemNode,
  CodeNode,
  CodeHighlightNode,
  LinkNode,
  AutoLinkNode,
];

export function ChatLexicalEditor({
  onSend,
  onTypingStart,
  onTypingStop,
  disabled,
  editorHandleRef,
}: Props) {
  const lastTypingSentRef = useRef(0);
  const clearEditorRef = useRef<(() => void) | null>(null);

  const TYPING_THROTTLE_MS = 2_000;

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
    namespace: "ChatDemoEditor",
    theme: editorTheme,
    nodes: EDITOR_NODES,
    onError: (error: Error) => {
      console.error("Lexical error:", error);
    },
    editable: !disabled,
  };

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="flex-1 min-w-0 rounded-md border border-input bg-background text-sm ring-offset-background focus-within:ring-1 focus-within:ring-ring overflow-hidden">
        <ToolbarPlugin />
        <div className="relative">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className="lexical-editor-input min-h-[38px] max-h-[200px] overflow-y-auto px-3 py-2 outline-none text-xs"
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
            placeholder={
              <div className="absolute top-2 left-3 text-muted-foreground pointer-events-none select-none text-xs">
                Type a message…
              </div>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
        </div>
      </div>
      <HistoryPlugin />
      <ListPlugin />
      <LinkPlugin attributes={EXTERNAL_LINK_ATTRIBUTES} />
      <OnChangePlugin onChange={() => {}} ignoreSelectionChange />
      <SendOnEnterPlugin onSend={handleSend} />
      <ListKeyboardPlugin />
      <ClearEditorPlugin clearRef={clearEditorRef} />
      <ExternalSendPlugin onSend={handleSend} editorHandleRef={editorHandleRef} />
    </LexicalComposer>
  );
}
