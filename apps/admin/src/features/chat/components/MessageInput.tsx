import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Send, Check, X } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { useGenerateReply } from "@/features/ai/hooks/useGenerateReply";
import { useImproveMessage } from "@/features/ai/hooks/useImproveMessage";
import { useAiAvailability } from "@/features/ai/hooks/useAiAvailability";
import { LexicalEditor, type EditorHandle } from "@repo/lexical-utils/react";
import type { ContentFormat } from "@repo/types";

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
  const [editorHasContent, setEditorHasContent] = useState(false);
  const editorHandleRef = useRef<EditorHandle | null>(null);
  const improveSnapshotRef = useRef<string>("");

  const { isAvailable: aiAvailable } = useAiAvailability();

  const handleGenerateSuccess = useCallback((text: string) => {
    editorHandleRef.current?.insertAiMarkdown(text);
    setIsAiSuggestion(true);
  }, []);

  const { generate, cancel: cancelGenerate, isGenerating } = useGenerateReply({
    onSuccess: handleGenerateSuccess,
  });

  const handleImproveSuccess = useCallback((text: string) => {
    editorHandleRef.current?.insertAiMarkdown(text);
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
    (content: string, contentFormat: ContentFormat) => {
      if (disabled) return;
      onSend(content, contentFormat);
      setIsAiSuggestion(false);
      setImproveState("idle");
      improveSnapshotRef.current = "";
    },
    [onSend, disabled],
  );

  const handleClearAiSuggestion = () => {
    setIsAiSuggestion(false);
  };

  const handleAcceptImprovement = () => {
    setImproveState("idle");
    improveSnapshotRef.current = "";
  };

  const handleRejectImprovement = () => {
    const snapshot = improveSnapshotRef.current;
    if (snapshot) {
      editorHandleRef.current?.insertAiMarkdown(snapshot);
    }
    setImproveState("idle");
    improveSnapshotRef.current = "";
  };

  const handleEditorChange = useCallback(() => {
    const hasContent = !(editorHandleRef.current?.isEmpty() ?? true);
    setEditorHasContent(hasContent);
  }, []);

  const handleGenerate = useCallback(() => {
    generate(conversationId);
  }, [generate, conversationId]);

  const handleImprove = useCallback(() => {
    const draft = editorHandleRef.current?.exportMarkdown() ?? "";
    if (!draft.trim()) return;
    improveSnapshotRef.current = draft;
    improve({ conversationId, draft });
  }, [improve, conversationId]);

  const canGenerate =
    aiAvailable && !aiInFlight && !disabled && improveState === "idle" && !editorHasContent;
  const canImprove =
    aiAvailable && !aiInFlight && !disabled && improveState === "idle" && editorHasContent;

  const aiToolbarProps = useMemo(
    () =>
      aiAvailable
        ? {
            onGenerate: handleGenerate,
            onCancelGenerate: cancelGenerate,
            isGenerating,
            canGenerate,
            onImprove: handleImprove,
            isImproving,
            canImprove,
          }
        : undefined,
    [
      aiAvailable,
      handleGenerate,
      cancelGenerate,
      isGenerating,
      canGenerate,
      handleImprove,
      isImproving,
      canImprove,
    ],
  );

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
          ai={aiToolbarProps}
          onChange={handleEditorChange}
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
