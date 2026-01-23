export type BillingRole = "operator" | "admin" | "super_admin";

export type BillingStatusResponse = {
  plan: "FREE" | "BASIC" | "PREMIUM" | "ENTERPRISE";
  planStatus:
    | "active"
    | "trialing"
    | "past_due"
    | "canceled"
    | "unpaid"
    | "incomplete"
    | "paused"
    | null;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: string | null;
  role: BillingRole;
  isReady: boolean;
};

export type CheckoutPlan = "basic" | "premium" | "enterprise";

export type CheckoutRequest = {
  plan: CheckoutPlan;
};

export type CheckoutResponse =
  | { url: string }
  | { status: "manual_review"; message?: string };

export type PortalSessionResponse = {
  url: string;
};

