import { useMutation } from "@tanstack/react-query";
import { createPortalSession } from "../lib/billing.client";

export function useCreatePortalSessionMutation() {
  return useMutation({
    mutationFn: createPortalSession,
  });
}
