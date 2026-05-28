import { FileCode } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import type { BlockType } from "./useToolbarState";

type CodeBlockButtonProps = {
  blockType: BlockType;
  formatCodeBlock: () => void;
  btnClass: string;
  activeClass: string;
};

export function CodeBlockButton({
  blockType,
  formatCodeBlock,
  btnClass,
  activeClass,
}: CodeBlockButtonProps) {
  return (
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
  );
}
