import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Sparkles, Loader2, Wand2, Check, X } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { useGenerateReply } from "@/features/ai/hooks/useGenerateReply";
import { useImproveMessage } from "@/features/ai/hooks/useImproveMessage";
import { useAiAvailability } from "@/features/ai/hooks/useAiAvailability";

type Props = {
  onSend: (content: string) => void;
  onTypingStart: () => void;
  onTypingStop: () => void;
  disabled: boolean;
  placeholder: string;
  conversationId: string;
};

type ImproveState = "idle" | "generating" | "review";

const TYPING_THROTTLE_MS = 2_000;

export function MessageInput({
  onSend,
  onTypingStart,
  onTypingStop,
  disabled,
  placeholder,
  conversationId,
}: Props) {
  const [value, setValue] = useState("");
  const [isAiSuggestion, setIsAiSuggestion] = useState(false);
  const [improveState, setImproveState] = useState<ImproveState>("idle");
  const [originalDraft, setOriginalDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const lastTypingSentRef = useRef(0);

  const { isAvailable: aiAvailable } = useAiAvailability();

  const handleGenerateSuccess = useCallback((text: string) => {
    setValue(text);
    setIsAiSuggestion(true);
    inputRef.current?.focus();
  }, []);

  const { generate, cancel: cancelGenerate, isGenerating } = useGenerateReply({
    onSuccess: handleGenerateSuccess,
  });

  const handleImproveSuccess = useCallback((text: string) => {
    setValue(text);
    setImproveState("review");
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
  }, [cancelGenerate, cancelImprove, conversationId]);

  useEffect(() => {
    if (isImproving) {
      setImproveState("generating");
    }
  }, [isImproving]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
    if (isAiSuggestion) setIsAiSuggestion(false);

    if (newValue.length === 0) {
      onTypingStop();
      lastTypingSentRef.current = 0;
      return;
    }

    const now = Date.now();
    if (now - lastTypingSentRef.current >= TYPING_THROTTLE_MS) {
      lastTypingSentRef.current = now;
      onTypingStart();
    }
  };

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    setIsAiSuggestion(false);
    setImproveState("idle");
    setOriginalDraft("");
    lastTypingSentRef.current = 0;
    inputRef.current?.focus();
  };

  const handleClearAiSuggestion = () => {
    setValue("");
    setIsAiSuggestion(false);
    inputRef.current?.focus();
  };

  const handleImproveClick = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setOriginalDraft(value);
    setIsAiSuggestion(false);
    improve({ conversationId, draft: trimmed });
  };

  const handleAcceptImprovement = () => {
    setImproveState("idle");
    setOriginalDraft("");
    inputRef.current?.focus();
  };

  const handleRejectImprovement = () => {
    setValue(originalDraft);
    setImproveState("idle");
    setOriginalDraft("");
    inputRef.current?.focus();
  };

  const canGenerate = aiAvailable && !value.trim() && !aiInFlight && !disabled && improveState === "idle";
  const canImprove = aiAvailable && !!value.trim() && !aiInFlight && !disabled && improveState === "idle";
  const isLocked = improveState === "generating" || improveState === "review";

  return (
    <div className="p-3 border-t border-border bg-card/50 shrink-0">
      {isAiSuggestion && (
        <div className="flex items-center gap-1.5 mb-1.5 px-1">
          <span className="text-xs font-medium text-violet-500 bg-violet-500/10 px-1.5 py-0.5 rounded">
            AI suggestion
          </span>
          <button
            onClick={handleClearAiSuggestion}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
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
            className="text-xs text-emerald-600 hover:text-emerald-700 transition-colors flex items-center gap-0.5"
          >
            <Check className="h-3 w-3" />
            Accept
          </button>
          <button
            onClick={handleRejectImprovement}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-0.5"
          >
            <X className="h-3 w-3" />
            Reject
          </button>
        </div>
      )}
      <div className="flex gap-2">
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
              onClick={handleImproveClick}
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
        <Input
          ref={inputRef}
          value={value}
          onChange={handleChange}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={
            isGenerating
              ? "Generating AI reply..."
              : isImproving
                ? "Improving message..."
                : placeholder
          }
          disabled={disabled || isLocked || isGenerating}
          readOnly={improveState === "review"}
          className={`flex-1 ${
            isAiSuggestion
              ? "border-violet-500/50 bg-violet-500/5"
              : improveState === "review"
                ? "border-amber-500/50 bg-amber-500/5"
                : improveState === "generating"
                  ? "border-amber-500/30 bg-amber-500/5"
                  : ""
          }`}
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={disabled || !value.trim() || aiInFlight || improveState === "review"}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
