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
  aiAddonActive: boolean;
  isReady: boolean;
};

export type AiAddonErrorCode =
  | "no_active_subscription"
  | "subscription_not_active"
  | "plan_not_eligible"
  | "ai_addon_already_active"
  | "ai_addon_not_active"
  | "internal_server_error"
  | "unknown_error";

export type AiAddonResponse = {
  status: "pending";
  message?: string;
};

export type AiAddonPreviewResponse = {
  currency: string;
  /** Prorated amount charged immediately, in minor units. */
  prorationAmount: number;
  /** Recurring monthly amount, in minor units. */
  recurringAmount: number;
  /** ISO date of the first full recurring charge. */
  nextBillingDate: string;
};

export type CheckoutPlan = "basic" | "premium" | "enterprise";

export type EnterpriseRequestDetails = {
  fullName: string;
  email: string;
  phone?: string;
  teamSize?: number;
  notes?: string;
};

export type CheckoutRequest = {
  plan: CheckoutPlan;
  enterpriseDetails?: EnterpriseRequestDetails;
};

export type CheckoutResponse =
  | { url: string }
  | { status: "manual_review"; message?: string };

export type PortalSessionResponse = {
  url: string;
};
