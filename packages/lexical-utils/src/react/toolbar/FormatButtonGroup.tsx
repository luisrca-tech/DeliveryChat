import { Bold, Italic, Underline, Strikethrough } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import type { TextFormatType } from "lexical";

type FormatButtonGroupProps = {
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  isStrikethrough: boolean;
  formatText: (format: TextFormatType) => void;
  btnClass: string;
  activeClass: string;
};

export function FormatButtonGroup({
  isBold,
  isItalic,
  isUnderline,
  isStrikethrough,
  formatText,
  btnClass,
  activeClass,
}: FormatButtonGroupProps) {
  return (
    <>
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
    </>
  );
}
