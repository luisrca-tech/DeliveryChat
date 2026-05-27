import {
  $getSelection,
  $isRangeSelection,
  type LexicalEditor,
} from "lexical";
import { $getNearestNodeOfType } from "@lexical/utils";
import { $isListItemNode, ListItemNode } from "@lexical/list";

export function $getActiveListItem(): ListItemNode | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  return $getNearestNodeOfType(selection.anchor.getNode(), ListItemNode);
}

export function isSelectionInListItem(editor: LexicalEditor): boolean {
  return editor.getEditorState().read(() => $getActiveListItem() !== null);
}
