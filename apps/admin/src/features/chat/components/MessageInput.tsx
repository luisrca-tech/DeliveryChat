import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { useGenerateReply } from "@/features/ai/hooks/useGenerateReply";
import { useAiAvailability } from "@/features/ai/hooks/useAiAvailability";

type Props = {
  onSend: (content: string) => void;
  onTypingStart: () => void;
  onTypingStop: () => void;
  disabled: boolean;
  placeholder: string;
  conversationId: string;
};

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
  const inputRef = useRef<HTMLInputElement>(null);
  const lastTypingSentRef = useRef(0);

  const { isAvailable: aiAvailable } = useAiAvailability();

  const handleAiSuccess = useCallback((text: string) => {
    setValue(text);
    setIsAiSuggestion(true);
    inputRef.current?.focus();
  }, []);

  const { generate, cancel, isGenerating } = useGenerateReply({
    onSuccess: handleAiSuccess,
  });

  useEffect(() => {
    return () => {
      cancel();
    };
  }, [cancel, conversationId]);

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
    lastTypingSentRef.current = 0;
    inputRef.current?.focus();
  };

  const handleClearAiSuggestion = () => {
    setValue("");
    setIsAiSuggestion(false);
    inputRef.current?.focus();
  };

  const canGenerate = aiAvailable && !value.trim() && !isGenerating && !disabled;

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
      <div className="flex gap-2">
        {aiAvailable && (
          <Button
            size="icon"
            variant="outline"
            onClick={() =>
              isGenerating ? cancel() : generate(conversationId)
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
          placeholder={isGenerating ? "Generating AI reply..." : placeholder}
          disabled={disabled || isGenerating}
          className={`flex-1 ${isAiSuggestion ? "border-violet-500/50 bg-violet-500/5" : ""}`}
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={disabled || !value.trim() || isGenerating}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
