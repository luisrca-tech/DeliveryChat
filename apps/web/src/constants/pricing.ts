export interface PricingPlan {
  name: string;
  price: string;
  description: string;
  features: string[];
  cta: string;
  popular: boolean;
}

export const plans: PricingPlan[] = [
  {
    name: "Starter",
    price: "49",
    description: "Perfect for small businesses getting started",
    features: [
      "Up to 1,000 monthly visitors",
      "1 chat widget",
      "Basic customization",
      "Email support",
      "7-day message history",
    ],
    cta: "Start Free Trial",
    popular: false,
  },
  {
    name: "Professional",
    price: "99",
    description: "For growing teams that need more power",
    features: [
      "Up to 10,000 monthly visitors",
      "5 chat widgets",
      "Advanced customization",
      "Priority support",
      "90-day message history",
      "Custom domain support",
      "Analytics dashboard",
    ],
    cta: "Start Free Trial",
    popular: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    description: "For large organizations with specific needs",
    features: [
      "Unlimited visitors",
      "Unlimited widgets",
      "White-label solution",
      "24/7 phone support",
      "Unlimited history",
      "Custom integrations",
      "SLA guarantee",
      "Dedicated account manager",
    ],
    cta: "Contact Sales",
    popular: false,
  },
];
