import { Sparkles, Wand2, Loader2 } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";

export type AiToolbarProps = {
  onGenerate: () => void;
  onCancelGenerate: () => void;
  isGenerating: boolean;
  canGenerate: boolean;
  onImprove: () => void;
  isImproving: boolean;
  canImprove: boolean;
};

type AiToolbarSectionProps = {
  ai: AiToolbarProps;
  btnClass: string;
};

export function AiToolbarSection({ ai, btnClass }: AiToolbarSectionProps) {
  return (
    <>
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
  );
}
