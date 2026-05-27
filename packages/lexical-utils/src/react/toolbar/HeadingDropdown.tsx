import { Heading1, Heading2, Heading3 } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import type { HeadingTagType } from "@lexical/rich-text";
import type { BlockType } from "./useToolbarState";

type HeadingDropdownProps = {
  blockType: BlockType;
  formatHeading: (heading: HeadingTagType) => void;
  activeClass: string;
};

export function HeadingDropdown({
  blockType,
  formatHeading,
  activeClass,
}: HeadingDropdownProps) {
  const isHeading = blockType === "h1" || blockType === "h2" || blockType === "h3";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={`h-7 px-2 text-xs ${isHeading ? activeClass : ""}`}
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
  );
}
