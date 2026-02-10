export type PlanUpgradedEmailProps = Readonly<{
  plan: "BASIC" | "PREMIUM";
  organizationName?: string;
  nextBillingDate?: string | null;
}>;

