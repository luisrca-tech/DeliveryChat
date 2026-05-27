import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  COMMAND_PRIORITY_HIGH,
  KEY_ENTER_COMMAND,
  $getRoot,
} from "lexical";
import { isPlainTextLexicalJson } from "./serializeLexicalJson";
import { isSelectionInListItem } from "./listUtils";
import type { ContentFormat } from "@repo/types";

type Props = {
  onSend: (content: string, isEmpty: boolean, contentFormat: ContentFormat) => void;
};

export function SendOnEnterPlugin({ onSend }: Props) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event: KeyboardEvent | null) => {
        if (!event) return false;

        if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
          return false;
        }

        if (isSelectionInListItem(editor)) {
          return false;
        }

        event.preventDefault();

        const editorState = editor.getEditorState();
        let isEmpty = true;
        editorState.read(() => {
          const root = $getRoot();
          const text = root.getTextContent().trim();
          isEmpty = text.length === 0;
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

        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor, onSend]);

  return null;
}
