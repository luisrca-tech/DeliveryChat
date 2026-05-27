import {
  $createRangeSelection,
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  type LexicalEditor,
} from "lexical";
import { $toggleLink, formatUrl, type LinkAttributes } from "@lexical/link";

export const EXTERNAL_LINK_ATTRIBUTES: LinkAttributes = {
  target: "_blank",
  rel: "noopener noreferrer",
};

export type SavedSelectionPoints = {
  anchorKey: string;
  anchorOffset: number;
  anchorType: "text" | "element";
  focusKey: string;
  focusOffset: number;
  focusType: "text" | "element";
};

export function captureSelection(
  editor: LexicalEditor,
): SavedSelectionPoints | null {
  let saved: SavedSelectionPoints | null = null;
  editor.getEditorState().read(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;
    saved = {
      anchorKey: selection.anchor.key,
      anchorOffset: selection.anchor.offset,
      anchorType: selection.anchor.type,
      focusKey: selection.focus.key,
      focusOffset: selection.focus.offset,
      focusType: selection.focus.type,
    };
  });
  return saved;
}

export function insertLinkAtSelection(
  editor: LexicalEditor,
  rawUrl: string,
  saved: SavedSelectionPoints | null,
): void {
  const url = formatUrl(rawUrl.trim());

  editor.update(() => {
    if (saved) {
      const selection = $createRangeSelection();
      selection.anchor.set(
        saved.anchorKey,
        saved.anchorOffset,
        saved.anchorType,
      );
      selection.focus.set(
        saved.focusKey,
        saved.focusOffset,
        saved.focusType,
      );
      $setSelection(selection);
    }

    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;

    if (selection.isCollapsed()) {
      const textNode = $createTextNode(url);
      selection.insertNodes([textNode]);
      textNode.select(0, url.length);
    }

    $toggleLink({ url, ...EXTERNAL_LINK_ATTRIBUTES });
  });

  editor.focus();
}
