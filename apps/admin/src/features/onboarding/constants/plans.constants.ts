import type { CheckoutPlan } from "@/features/billing/types/billing.types";

export type PlanCard = {
  key: CheckoutPlan;
  name: string;
  price: string;
  description: string;
  features: string[];
  cta: string;
  popular?: boolean;
};

export const PLAN_CARDS: PlanCard[] = [
  {
    key: "basic",
    name: "Basic",
    price: "$49/mo",
    description: "Perfect for small businesses getting started.",
    features: ["14-day free trial", "Email support", "Basic customization"],
    cta: "Start Basic Trial",
  },
  {
    key: "premium",
    name: "Premium",
    price: "$99/mo",
    description: "For growing teams that need more power.",
    features: ["14-day free trial", "Priority support", "Analytics dashboard"],
    cta: "Start Premium Trial",
    popular: true,
  },
  {
    key: "enterprise",
    name: "Enterprise",
    price: "Custom",
    description: "For large organizations with specific needs.",
    features: ["Custom pricing", "Dedicated support", "Custom integrations"],
    cta: "Request Enterprise",
  },
];
