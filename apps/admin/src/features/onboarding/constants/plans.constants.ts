import type {
  CheckoutCurrency,
  CheckoutPlan,
} from "@/features/billing/types/billing.types";

export type PlanCard = {
  key: CheckoutPlan;
  name: string;
  /** Display price per supported currency. `null` when the plan has no fixed price. */
  price: Record<CheckoutCurrency, string | null>;
  description: string;
  features: string[];
  cta: string;
  popular?: boolean;
};

export const PLAN_CARDS: PlanCard[] = [
  {
    key: "basic",
    name: "Basic",
    price: { brl: "R$ 90/mo", usd: "$19/mo" },
    description: "Perfect for small businesses getting started.",
    features: ["14-day free trial", "Email support", "Basic customization"],
    cta: "Start Basic Trial",
  },
  {
    key: "premium",
    name: "Premium",
    price: { brl: "R$ 240/mo", usd: "$49/mo" },
    description: "For growing teams that need more power.",
    features: ["14-day free trial", "Priority support", "Analytics dashboard"],
    cta: "Start Premium Trial",
    popular: true,
  },
  {
    key: "enterprise",
    name: "Enterprise",
    price: { brl: "Custom", usd: "Custom" },
    description: "For large organizations with specific needs.",
    features: ["Custom pricing", "Dedicated support", "Custom integrations"],
    cta: "Request Enterprise",
  },
];
