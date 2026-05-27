import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  SELECTION_CHANGE_COMMAND,
  type TextFormatType,
  type LexicalEditor,
} from "lexical";
import {
  $isHeadingNode,
  $createHeadingNode,
  type HeadingTagType,
} from "@lexical/rich-text";
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  $isListNode,
  ListNode,
} from "@lexical/list";
import { $isCodeNode } from "@lexical/code";
import { $isLinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import { $setBlocksType } from "@lexical/selection";
import { $getNearestNodeOfType } from "@lexical/utils";
import {
  $createParagraphNode,
} from "lexical";
import {
  $createCodeNode,
} from "@lexical/code";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  FileCode,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Link,
  Unlink,
  Sparkles,
  Wand2,
  Loader2,
} from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/ui/components/ui/popover";
import {
  captureSelection,
  insertLinkAtSelection,
  type SavedSelectionPoints,
} from "./linkInsert";
import { $getActiveListItem } from "./listUtils";

export type AiToolbarProps = {
  onGenerate: () => void;
  onCancelGenerate: () => void;
  isGenerating: boolean;
  canGenerate: boolean;
  onImprove: () => void;
  isImproving: boolean;
  canImprove: boolean;
};

type BlockType = "paragraph" | "h1" | "h2" | "h3" | "ul" | "ol" | "code";

type Props = {
  ai?: AiToolbarProps;
};

type InsertLinkButtonProps = {
  editor: LexicalEditor;
  isLink: boolean;
  btnClass: string;
  activeClass: string;
};

function InsertLinkButton({
  editor,
  isLink,
  btnClass,
  activeClass,
}: InsertLinkButtonProps) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const savedSelectionRef = useRef<SavedSelectionPoints | null>(null);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setUrl("");
      savedSelectionRef.current = null;
    }
  };

  const captureEditorSelection = () => {
    savedSelectionRef.current = captureSelection(editor);
  };

  const applyLink = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    insertLinkAtSelection(editor, trimmed, savedSelectionRef.current);
    handleOpenChange(false);
  };

  if (isLink) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={`${btnClass} ${activeClass}`}
        onClick={() => editor.dispatchCommand(TOGGLE_LINK_COMMAND, null)}
        title="Remove link"
      >
        <Unlink className="h-3.5 w-3.5" />
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={btnClass}
          title="Insert link"
          onMouseDown={(event) => {
            event.preventDefault();
            captureEditorSelection();
          }}
        >
          <Link className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-72 p-3">
        <form onSubmit={applyLink} className="flex flex-col gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="lexical-link-url">URL</Label>
            <Input
              id="lexical-link-url"
              type="url"
              placeholder="https://example.com"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!url.trim()}>
              Apply
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

export function ToolbarPlugin({ ai }: Props) {
  const [editor] = useLexicalComposerContext();
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [isStrikethrough, setIsStrikethrough] = useState(false);
  const [isCode, setIsCode] = useState(false);
  const [isLink, setIsLink] = useState(false);
  const [blockType, setBlockType] = useState<BlockType>("paragraph");

  const updateToolbar = useCallback(() => {
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;

      setIsBold(selection.hasFormat("bold"));
      setIsItalic(selection.hasFormat("italic"));
      setIsUnderline(selection.hasFormat("underline"));
      setIsStrikethrough(selection.hasFormat("strikethrough"));
      setIsCode(selection.hasFormat("code"));

      const anchorNode = selection.anchor.getNode();
      const element =
        anchorNode.getKey() === "root"
          ? anchorNode
          : anchorNode.getTopLevelElementOrThrow();

      if ($isHeadingNode(element)) {
        setBlockType(element.getTag() as BlockType);
      } else if ($isListNode(element)) {
        const listType = element.getListType();
        setBlockType(listType === "number" ? "ol" : "ul");
      } else if ($isCodeNode(element)) {
        setBlockType("code");
      } else {
        const parentList = $getNearestNodeOfType(anchorNode, ListNode);
        if (parentList) {
          setBlockType(parentList.getListType() === "number" ? "ol" : "ul");
        } else {
          setBlockType("paragraph");
        }
      }

      const node = selection.anchor.getNode();
      const parent = node.getParent();
      setIsLink($isLinkNode(parent) || $isLinkNode(node));
    });
  }, [editor]);

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        updateToolbar();
        return false;
      },
      COMMAND_PRIORITY_CRITICAL,
    );
  }, [editor, updateToolbar]);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        updateToolbar();
      });
    });
  }, [editor, updateToolbar]);

  const formatText = (format: TextFormatType) => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
  };

  const formatHeading = (heading: HeadingTagType) => {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      if (blockType === heading) {
        $setBlocksType(selection, () => $createParagraphNode());
      } else {
        $setBlocksType(selection, () => $createHeadingNode(heading));
      }
    });
  };

  const focusListItem = () => {
    editor.update(() => {
      $getActiveListItem()?.selectStart();
    });
    editor.focus();
  };

  const formatBulletList = () => {
    if (blockType !== "ul") {
      editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
      focusListItem();
    } else {
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          $setBlocksType(selection, () => $createParagraphNode());
        }
      });
    }
  };

  const formatNumberedList = () => {
    if (blockType !== "ol") {
      editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
      focusListItem();
    } else {
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          $setBlocksType(selection, () => $createParagraphNode());
        }
      });
    }
  };

  const formatCodeBlock = () => {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      if (blockType === "code") {
        $setBlocksType(selection, () => $createParagraphNode());
      } else {
        const codeNode = $createCodeNode();
        $setBlocksType(selection, () => codeNode);
      }
    });
  };

  const btnClass = "h-7 w-7 p-0 shrink-0";
  const activeClass = "bg-accent text-accent-foreground";

  return (
    <div className="flex items-center gap-0.5 px-2 py-1 border-b border-border flex-wrap">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={`${btnClass} ${isBold ? activeClass : ""}`}
        onClick={() => formatText("bold")}
        title="Bold (Ctrl+B)"
      >
        <Bold className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={`${btnClass} ${isItalic ? activeClass : ""}`}
        onClick={() => formatText("italic")}
        title="Italic (Ctrl+I)"
      >
        <Italic className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={`${btnClass} ${isUnderline ? activeClass : ""}`}
        onClick={() => formatText("underline")}
        title="Underline (Ctrl+U)"
      >
        <Underline className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={`${btnClass} ${isStrikethrough ? activeClass : ""}`}
        onClick={() => formatText("strikethrough")}
        title="Strikethrough"
      >
        <Strikethrough className="h-3.5 w-3.5" />
      </Button>

      <div className="w-px h-5 bg-border mx-0.5" />

      <InsertLinkButton
        editor={editor}
        isLink={isLink}
        btnClass={btnClass}
        activeClass={activeClass}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={`${btnClass} ${isCode ? activeClass : ""}`}
        onClick={() => formatText("code")}
        title="Inline code"
      >
        <Code className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={`${btnClass} ${blockType === "code" ? activeClass : ""}`}
        onClick={formatCodeBlock}
        title="Code block"
      >
        <FileCode className="h-3.5 w-3.5" />
      </Button>

      <div className="w-px h-5 bg-border mx-0.5" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={`h-7 px-2 text-xs ${blockType === "h1" || blockType === "h2" || blockType === "h3" ? activeClass : ""}`}
            title="Heading"
          >
            {blockType === "h1"
              ? "H1"
              : blockType === "h2"
                ? "H2"
                : blockType === "h3"
                  ? "H3"
                  : "H"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-28">
          <DropdownMenuItem
            onSelect={() => formatHeading("h1")}
            className="cursor-pointer"
          >
            <Heading1 className="mr-2 h-4 w-4" />
            Heading 1
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => formatHeading("h2")}
            className="cursor-pointer"
          >
            <Heading2 className="mr-2 h-4 w-4" />
            Heading 2
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => formatHeading("h3")}
            className="cursor-pointer"
          >
            <Heading3 className="mr-2 h-4 w-4" />
            Heading 3
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="w-px h-5 bg-border mx-0.5" />

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={`${btnClass} ${blockType === "ul" ? activeClass : ""}`}
        onClick={formatBulletList}
        title="Bullet list"
      >
        <List className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={`${btnClass} ${blockType === "ol" ? activeClass : ""}`}
        onClick={formatNumberedList}
        title="Numbered list"
      >
        <ListOrdered className="h-3.5 w-3.5" />
      </Button>

      {ai && (
        <>
          <div className="w-px h-5 bg-border mx-1" />

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={`${btnClass} text-violet-500 hover:text-violet-600 hover:bg-violet-500/10 ${ai.isGenerating ? "animate-pulse" : ""}`}
            onClick={() =>
              ai.isGenerating ? ai.onCancelGenerate() : ai.onGenerate()
            }
            disabled={!ai.isGenerating && !ai.canGenerate}
            title={
              ai.isGenerating
                ? "Cancel generation"
                : ai.canGenerate
                  ? "Generate AI reply"
                  : "Clear the input to generate an AI reply"
            }
          >
            {ai.isGenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={`${btnClass} text-violet-500 hover:text-violet-600 hover:bg-violet-500/10 ${ai.isImproving ? "animate-pulse" : ""}`}
            onClick={ai.onImprove}
            disabled={!ai.canImprove}
            title={
              ai.canImprove
                ? "Improve message with AI"
                : "Type a message first to improve it"
            }
          >
            {ai.isImproving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wand2 className="h-3.5 w-3.5" />
            )}
          </Button>
        </>
      )}
    </div>
  );
}
