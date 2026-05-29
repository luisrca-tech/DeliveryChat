import { useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { improveMessageRequest, AiApiError } from "../lib/ai.client";
import { getAiErrorMessage } from "../lib/aiErrorMessages";

type UseImproveMessageOptions = {
  onSuccess: (text: string) => void;
};

export function useImproveMessage({ onSuccess }: UseImproveMessageOptions) {
  const abortControllerRef = useRef<AbortController | null>(null);

  const mutation = useMutation({
    mutationFn: (params: { conversationId: string; draft: string }) => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      return improveMessageRequest(
        params.conversationId,
        params.draft,
        controller.signal,
      );
    },
    onSuccess: (data) => {
      abortControllerRef.current = null;
      onSuccess(data.text);
    },
    onError: (error) => {
      abortControllerRef.current = null;
      if (error instanceof DOMException && error.name === "AbortError") return;

      const code =
        error instanceof AiApiError ? error.code : "unknown_error";
      const retryAfter =
        error instanceof AiApiError ? error.retryAfter : undefined;
      const serverMessage =
        error instanceof AiApiError ? error.message : undefined;
      toast.error(getAiErrorMessage(code, retryAfter, serverMessage));
    },
  });

  const mutationRef = useRef(mutation);
  mutationRef.current = mutation;

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    mutationRef.current.reset();
  }, []);

  return {
    improve: mutation.mutate,
    cancel,
    isImproving: mutation.isPending,
  };
}
