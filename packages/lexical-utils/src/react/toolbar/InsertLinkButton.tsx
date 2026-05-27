import { useRef, useState, type FormEvent } from "react";
import { TOGGLE_LINK_COMMAND } from "@lexical/link";
import { Link, Unlink } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/ui/components/ui/popover";
import type { LexicalEditor } from "lexical";
import {
  captureSelection,
  insertLinkAtSelection,
  type SavedSelectionPoints,
} from "../linkInsert";

type InsertLinkButtonProps = {
  editor: LexicalEditor;
  isLink: boolean;
  btnClass: string;
  activeClass: string;
};

export function InsertLinkButton({
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
