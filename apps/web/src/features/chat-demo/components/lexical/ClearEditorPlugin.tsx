import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getRoot, $createParagraphNode } from "lexical";

type Props = {
  clearRef: React.MutableRefObject<(() => void) | null>;
};

export function ClearEditorPlugin({ clearRef }: Props) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    clearRef.current = () => {
      editor.update(() => {
        const root = $getRoot();
        root.clear();
        root.append($createParagraphNode());
      });
      editor.focus();
    };
  }, [editor, clearRef]);

  return null;
}
