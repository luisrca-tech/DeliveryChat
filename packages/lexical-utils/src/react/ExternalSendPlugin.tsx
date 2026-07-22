import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getRoot, $createParagraphNode, $createTextNode } from "lexical";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
} from "@lexical/markdown";
import { AI_MARKDOWN_TRANSFORMERS } from "./aiMarkdownTransformers";
import { isPlainTextLexicalJson } from "../index";
import type { ContentFormat } from "@repo/types";

export type EditorHandle = {
  triggerSend: () => void;
  insertAiMarkdown: (markdown: string) => void;
  exportMarkdown: () => string;
  isEmpty: () => boolean;
};

type Props = {
  onSend: (
    content: string,
    isEmpty: boolean,
    contentFormat: ContentFormat,
  ) => void;
  editorHandleRef: import("react").MutableRefObject<EditorHandle | null>;
};

export function ExternalSendPlugin({ onSend, editorHandleRef }: Props) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editorHandleRef.current = {
      triggerSend: () => {
        const editorState = editor.getEditorState();
        let empty = true;
        editorState.read(() => {
          const root = $getRoot();
          empty = root.getTextContent().trim().length === 0;
        });

        if (empty) {
          onSend("", true, "plain");
          return;
        }

        const json = JSON.stringify(editorState.toJSON());
        const result = isPlainTextLexicalJson(json);
        if (result.plain) {
          onSend(result.text, false, "plain");
        } else {
          onSend(json, false, "lexical");
        }
      },

      insertAiMarkdown: (markdown: string) => {
        editor.update(() => {
          const root = $getRoot();
          root.clear();
          try {
            $convertFromMarkdownString(
              markdown,
              AI_MARKDOWN_TRANSFORMERS,
              root,
              true,
            );
          } catch {
            root.clear();
            const paragraph = $createParagraphNode();
            paragraph.append($createTextNode(markdown));
            root.append(paragraph);
          }
        });
        editor.focus();
      },

      exportMarkdown: () => {
        let markdown = "";
        editor.getEditorState().read(() => {
          markdown = $convertToMarkdownString(AI_MARKDOWN_TRANSFORMERS);
        });
        return markdown;
      },

      isEmpty: () => {
        let empty = true;
        editor.getEditorState().read(() => {
          const root = $getRoot();
          empty = root.getTextContent().trim().length === 0;
        });
        return empty;
      },
    };
  }, [editor, onSend, editorHandleRef]);

  return null;
}
