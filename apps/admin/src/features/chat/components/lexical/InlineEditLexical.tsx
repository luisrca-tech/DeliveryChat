import { useCallback, useEffect, useRef } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { HeadingNode } from "@lexical/rich-text";
import { ListNode, ListItemNode } from "@lexical/list";
import { CodeNode, CodeHighlightNode } from "@lexical/code";
import { LinkNode, AutoLinkNode } from "@lexical/link";
import {
  EXTERNAL_LINK_ATTRIBUTES,
  editorTheme,
  ListKeyboardPlugin,
} from "@repo/lexical-utils/react";
import {
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  COMMAND_PRIORITY_HIGH,
} from "lexical";
import { Check, X } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";

const EDITOR_NODES = [
  HeadingNode,
  ListNode,
  ListItemNode,
  CodeNode,
  CodeHighlightNode,
  LinkNode,
  AutoLinkNode,
];

type Props = {
  initialJson: string;
  onSave: (json: string) => void;
  onCancel: () => void;
};

function parseEditorState(json: string) {
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

function KeyboardPlugin({
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
        if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return false;
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

export function InlineEditLexical({ initialJson, onSave, onCancel }: Props) {
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
      <KeyboardPlugin onSave={handleSave} onCancel={onCancel} />
      <AutoFocusPlugin />
      <EditorRefPlugin editorRef={editorRef} />
    </LexicalComposer>
  );
}

function EditorRefPlugin({
  editorRef,
}: {
  editorRef: React.MutableRefObject<{ getJson: () => string } | null>;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editorRef.current = {
      getJson: () => JSON.stringify(editor.getEditorState().toJSON()),
    };
  }, [editor, editorRef]);

  return null;
}
