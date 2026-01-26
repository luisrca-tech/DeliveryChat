import { useMutation } from "@tanstack/react-query";
import type { CheckoutRequest } from "../types/billing.types";
import { createCheckout } from "../lib/billing.client";

export function useCreateCheckoutMutation() {
  return useMutation({
    mutationFn: (body: CheckoutRequest) => createCheckout(body),
  });
}
