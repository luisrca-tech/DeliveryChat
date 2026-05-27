import { useCallback, useRef } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HeadingNode } from "@lexical/rich-text";
import { ListNode, ListItemNode } from "@lexical/list";
import { CodeNode, CodeHighlightNode } from "@lexical/code";
import { LinkNode, AutoLinkNode } from "@lexical/link";
import { editorTheme } from "./theme";
import { ToolbarPlugin } from "./ToolbarPlugin";
import { SendOnEnterPlugin } from "./SendOnEnterPlugin";
import { ClearEditorPlugin } from "./ClearEditorPlugin";
import { ExternalSendPlugin } from "./ExternalSendPlugin";

export type EditorHandle = {
  triggerSend: () => void;
};

type Props = {
  onSend: (json: string) => void;
  onTypingStart: () => void;
  onTypingStop: () => void;
  disabled: boolean;
  placeholder: string;
  editorHandleRef?: React.MutableRefObject<EditorHandle | null>;
  showToolbar?: boolean;
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

export function LexicalEditor({
  onSend,
  onTypingStart,
  onTypingStop,
  disabled,
  placeholder,
  editorHandleRef,
  showToolbar = true,
}: Props) {
  const lastTypingSentRef = useRef(0);
  const clearEditorRef = useRef<(() => void) | null>(null);

  const TYPING_THROTTLE_MS = 2_000;

  const handleSend = useCallback(
    (json: string, isEmpty: boolean) => {
      if (isEmpty || disabled) return;
      onSend(json);
      clearEditorRef.current?.();
      lastTypingSentRef.current = 0;
    },
    [onSend, disabled],
  );

  const initialConfig = {
    namespace: "ChatEditor",
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
        {showToolbar && <ToolbarPlugin />}
        <div className="relative">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className="lexical-editor-input min-h-[38px] max-h-[200px] overflow-y-auto px-3 py-2 outline-none"
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
              <div className="absolute top-2 left-3 text-muted-foreground pointer-events-none select-none">
                {placeholder}
              </div>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
        </div>
      </div>
      <HistoryPlugin />
      <ListPlugin />
      <LinkPlugin />
      <SendOnEnterPlugin onSend={handleSend} />
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
