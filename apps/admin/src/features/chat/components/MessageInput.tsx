import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Sparkles, Loader2, Wand2, Check, X } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { useGenerateReply } from "@/features/ai/hooks/useGenerateReply";
import { useImproveMessage } from "@/features/ai/hooks/useImproveMessage";
import { useAiAvailability } from "@/features/ai/hooks/useAiAvailability";
import { LexicalEditor, type EditorHandle } from "./lexical";

type Props = {
  onSend: (content: string, contentFormat: "plain" | "lexical") => void;
  onTypingStart: () => void;
  onTypingStop: () => void;
  disabled: boolean;
  placeholder: string;
  conversationId: string;
};

type ImproveState = "idle" | "generating" | "review";

export function MessageInput({
  onSend,
  onTypingStart,
  onTypingStop,
  disabled,
  placeholder,
  conversationId,
}: Props) {
  const [isAiSuggestion, setIsAiSuggestion] = useState(false);
  const [improveState, setImproveState] = useState<ImproveState>("idle");
  const editorHandleRef = useRef<EditorHandle | null>(null);

  const { isAvailable: aiAvailable } = useAiAvailability();

  const handleGenerateSuccess = useCallback((text: string) => {
    setIsAiSuggestion(true);
    void text;
  }, []);

  const { generate, cancel: cancelGenerate, isGenerating } = useGenerateReply({
    onSuccess: handleGenerateSuccess,
  });

  const handleImproveSuccess = useCallback((text: string) => {
    setImproveState("review");
    void text;
  }, []);

  const { improve, cancel: cancelImprove, isImproving } = useImproveMessage({
    onSuccess: handleImproveSuccess,
  });

  const aiInFlight = isGenerating || isImproving;

  useEffect(() => {
    return () => {
      cancelGenerate();
      cancelImprove();
    };
  }, [conversationId, cancelGenerate, cancelImprove]);

  useEffect(() => {
    if (isImproving) {
      setImproveState("generating");
    }
  }, [isImproving]);

  useEffect(() => {
    if (!isImproving && improveState === "generating") {
      setImproveState("idle");
    }
  }, [isImproving, improveState]);

  const handleSend = useCallback(
    (json: string) => {
      if (disabled) return;
      onSend(json, "lexical");
      setIsAiSuggestion(false);
      setImproveState("idle");
    },
    [onSend, disabled],
  );

  const handleClearAiSuggestion = () => {
    setIsAiSuggestion(false);
  };

  const handleAcceptImprovement = () => {
    setImproveState("idle");
  };

  const handleRejectImprovement = () => {
    setImproveState("idle");
  };

  const canGenerate = aiAvailable && !aiInFlight && !disabled && improveState === "idle";
  const canImprove = aiAvailable && !aiInFlight && !disabled && improveState === "idle";

  return (
    <div className="p-3 border-t border-border bg-card/50 shrink-0">
      {isAiSuggestion && (
        <div className="flex items-center gap-1.5 mb-1.5 px-1">
          <span className="text-xs font-medium text-violet-500 bg-violet-500/10 px-1.5 py-0.5 rounded">
            AI suggestion
          </span>
          <button
            onClick={handleClearAiSuggestion}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Clear
          </button>
        </div>
      )}
      {improveState === "review" && (
        <div className="flex items-center gap-1.5 mb-1.5 px-1">
          <span className="text-xs font-medium text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">
            AI improvement
          </span>
          <button
            onClick={handleAcceptImprovement}
            className="text-xs text-emerald-600 hover:text-emerald-700 transition-colors flex items-center gap-0.5 cursor-pointer"
          >
            <Check className="h-3 w-3" />
            Accept
          </button>
          <button
            onClick={handleRejectImprovement}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-0.5 cursor-pointer"
          >
            <X className="h-3 w-3" />
            Reject
          </button>
        </div>
      )}
      <div className="flex gap-2 items-end">
        {aiAvailable && (
          <>
            <Button
              size="icon"
              variant="outline"
              onClick={() =>
                isGenerating ? cancelGenerate() : generate(conversationId)
              }
              disabled={!isGenerating && !canGenerate}
              title={
                isGenerating
                  ? "Cancel generation"
                  : canGenerate
                    ? "Generate AI reply"
                    : "Clear the input to generate an AI reply"
              }
              className={isGenerating ? "animate-pulse" : ""}
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
            </Button>
            <Button
              size="icon"
              variant="outline"
              onClick={() => improve({ conversationId, draft: "" })}
              disabled={!canImprove}
              title={
                canImprove
                  ? "Improve message with AI"
                  : "Type a message first to improve it"
              }
              className={isImproving ? "animate-pulse" : ""}
            >
              {isImproving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
            </Button>
          </>
        )}
        <LexicalEditor
          onSend={handleSend}
          onTypingStart={onTypingStart}
          onTypingStop={onTypingStop}
          disabled={disabled || aiInFlight}
          placeholder={
            isGenerating
              ? "Generating AI reply..."
              : isImproving
                ? "Improving message..."
                : placeholder
          }
          editorHandleRef={editorHandleRef}
        />
        <Button
          size="icon"
          onClick={() => editorHandleRef.current?.triggerSend()}
          disabled={disabled || aiInFlight}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
