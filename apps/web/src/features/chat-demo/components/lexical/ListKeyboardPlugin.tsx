import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  COMMAND_PRIORITY_CRITICAL,
  KEY_ENTER_COMMAND,
  INSERT_LINE_BREAK_COMMAND,
  $getSelection,
  $isRangeSelection,
} from "lexical";
import {
  $handleListInsertParagraph,
  $isListItemNode,
} from "@lexical/list";
import { $getActiveListItem } from "./listUtils";

function $handleListEnter(): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return false;

  const listItem = $getActiveListItem();
  if (!listItem) return false;

  if (listItem.getTextContent().trim() === "") {
    return $handleListInsertParagraph();
  }

  const newListItem = listItem.insertNewAfter(selection, true);
  if ($isListItemNode(newListItem)) {
    newListItem.selectStart();
  }
  return true;
}

export function ListKeyboardPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event: KeyboardEvent | null) => {
        if (!event) return false;

        const inList = editor
          .getEditorState()
          .read(() => $getActiveListItem() !== null);

        if (event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
          return false;
        }

        const isModifiedEnter =
          event.ctrlKey || event.altKey || event.metaKey;

        if (isModifiedEnter) {
          if (inList) {
            event.preventDefault();
            const handled = $handleListEnter();
            if (handled) editor.focus();
            return handled;
          }

          event.preventDefault();
          editor.dispatchCommand(INSERT_LINE_BREAK_COMMAND, false);
          return true;
        }

        if (inList) {
          event.preventDefault();
          const handled = $handleListEnter();
          if (handled) editor.focus();
          return handled;
        }

        return false;
      },
      COMMAND_PRIORITY_CRITICAL,
    );
  }, [editor]);

  return null;
}
