export type TrialStartedEmailProps = Readonly<{
  plan: "BASIC" | "PREMIUM" | "ENTERPRISE";
  trialEndsAt: string;
  organizationName?: string;
}>;

