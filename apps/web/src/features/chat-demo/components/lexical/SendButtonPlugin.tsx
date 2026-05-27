import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getRoot } from "lexical";
import { isPlainTextLexicalJson } from "@repo/lexical-utils";
import type { ContentFormat } from "@repo/types";

export type EditorHandle = {
  triggerSend: () => void;
  isEmpty: () => boolean;
};

type Props = {
  onSend: (content: string, isEmpty: boolean, contentFormat: ContentFormat) => void;
  handleRef: React.MutableRefObject<EditorHandle | null>;
};

export function SendButtonPlugin({ onSend, handleRef }: Props) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    handleRef.current = {
      triggerSend: () => {
        const editorState = editor.getEditorState();
        let isEmpty = true;
        editorState.read(() => {
          const root = $getRoot();
          isEmpty = root.getTextContent().trim().length === 0;
        });

        if (!isEmpty) {
          const json = JSON.stringify(editorState.toJSON());
          const result = isPlainTextLexicalJson(json);
          if (result.plain) {
            onSend(result.text, false, "plain");
          } else {
            onSend(json, false, "lexical");
          }
        }
      },
      isEmpty: () => {
        return editor.getEditorState().read(() => {
          return $getRoot().getTextContent().trim().length === 0;
        });
      },
    };
  }, [editor, onSend, handleRef]);

  return null;
}
