import { useMutation } from "@tanstack/react-query";
import type { CheckoutPlan } from "../types/billing.types";
import { createCheckout } from "../lib/billing.client";

export function useCreateCheckoutMutation() {
  return useMutation({
    mutationFn: (plan: CheckoutPlan) => createCheckout({ plan }),
  });
}

