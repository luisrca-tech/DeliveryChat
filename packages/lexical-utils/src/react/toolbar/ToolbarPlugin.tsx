import { Code } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { useToolbarState } from "./useToolbarState";
import { FormatButtonGroup } from "./FormatButtonGroup";
import { HeadingDropdown } from "./HeadingDropdown";
import { ListButtonGroup } from "./ListButtonGroup";
import { InsertLinkButton } from "./InsertLinkButton";
import { CodeBlockButton } from "./CodeBlockButton";
import { AiToolbarSection, type AiToolbarProps } from "./AiToolbarSection";

export type ToolbarSection = "format" | "code" | "heading" | "list";

const DEFAULT_TOOLBAR_SECTIONS: ToolbarSection[] = [
  "format",
  "code",
  "heading",
  "list",
];

type ToolbarPluginProps = {
  toolbarSections?: ToolbarSection[];
  ai?: AiToolbarProps;
};

const BTN_CLASS = "h-7 w-7 p-0 shrink-0";
const ACTIVE_CLASS = "bg-accent text-accent-foreground";

function ToolbarDivider() {
  return <div className="w-px h-5 bg-border mx-0.5" />;
}

export function ToolbarPlugin({
  toolbarSections = DEFAULT_TOOLBAR_SECTIONS,
  ai,
}: ToolbarPluginProps) {
  const state = useToolbarState();

  const sectionRenderers: Record<ToolbarSection, () => React.JSX.Element> = {
    format: () => (
      <FormatButtonGroup
        isBold={state.isBold}
        isItalic={state.isItalic}
        isUnderline={state.isUnderline}
        isStrikethrough={state.isStrikethrough}
        formatText={state.formatText}
        btnClass={BTN_CLASS}
        activeClass={ACTIVE_CLASS}
      />
    ),
    code: () => (
      <>
        <InsertLinkButton
          editor={state.editor}
          isLink={state.isLink}
          btnClass={BTN_CLASS}
          activeClass={ACTIVE_CLASS}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={`${BTN_CLASS} ${state.isCode ? ACTIVE_CLASS : ""}`}
          onClick={() => state.formatText("code")}
          title="Inline code"
        >
          <Code className="h-3.5 w-3.5" />
        </Button>
        <CodeBlockButton
          blockType={state.blockType}
          formatCodeBlock={state.formatCodeBlock}
          btnClass={BTN_CLASS}
          activeClass={ACTIVE_CLASS}
        />
      </>
    ),
    heading: () => (
      <HeadingDropdown
        blockType={state.blockType}
        formatHeading={state.formatHeading}
        activeClass={ACTIVE_CLASS}
      />
    ),
    list: () => (
      <ListButtonGroup
        blockType={state.blockType}
        formatBulletList={state.formatBulletList}
        formatNumberedList={state.formatNumberedList}
        btnClass={BTN_CLASS}
        activeClass={ACTIVE_CLASS}
      />
    ),
  };

  return (
    <div className="flex items-center gap-0.5 px-2 py-1 border-b border-border flex-wrap">
      {toolbarSections.map((section, index) => (
        <span key={section} className="contents">
          {index > 0 && <ToolbarDivider />}
          {sectionRenderers[section]()}
        </span>
      ))}
      {ai && (
        <>
          <ToolbarDivider />
          <AiToolbarSection ai={ai} btnClass={BTN_CLASS} />
        </>
      )}
    </div>
  );
}
