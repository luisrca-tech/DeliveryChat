import { List, ListOrdered } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import type { BlockType } from "./useToolbarState";

type ListButtonGroupProps = {
  blockType: BlockType;
  formatBulletList: () => void;
  formatNumberedList: () => void;
  btnClass: string;
  activeClass: string;
};

export function ListButtonGroup({
  blockType,
  formatBulletList,
  formatNumberedList,
  btnClass,
  activeClass,
}: ListButtonGroupProps) {
  return (
    <>
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
    </>
  );
}
