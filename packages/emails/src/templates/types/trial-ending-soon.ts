export type TrialEndingSoonEmailProps = Readonly<{
  plan: "BASIC" | "PREMIUM" | "ENTERPRISE";
  trialEndsAt: string;
  daysLeft: number;
  organizationName?: string;
}>;
