import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getRoot } from "lexical";
import type { EditorHandle } from "./LexicalEditor";

type Props = {
  onSend: (json: string, isEmpty: boolean) => void;
  editorHandleRef: React.MutableRefObject<EditorHandle | null>;
};

export function ExternalSendPlugin({ onSend, editorHandleRef }: Props) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editorHandleRef.current = {
      triggerSend: () => {
        const editorState = editor.getEditorState();
        let isEmpty = true;
        editorState.read(() => {
          const root = $getRoot();
          isEmpty = root.getTextContent().trim().length === 0;
        });
        const json = JSON.stringify(editorState.toJSON());
        onSend(json, isEmpty);
      },
    };
  }, [editor, onSend, editorHandleRef]);

  return null;
}
