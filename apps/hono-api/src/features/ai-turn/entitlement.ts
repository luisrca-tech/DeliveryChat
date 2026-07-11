/**
 * Org-level + per-application entitlement for the autonomous AI assistant.
 *
 * A conversation may only be AI-handled when ALL hold:
 *   1. the org plan is add-on eligible (PREMIUM or ENTERPRISE),
 *   2. the AI add-on is actually active (`aiAddonActive`, derived from Stripe),
 *   3. the application has AI enabled, and
 *   4. the application opted into auto-responding.
 *
 * This is the single source of truth used both when deciding the initial
 * `handledBy` mode at conversation creation and when guarding each AI turn.
 */
export const ADDON_ELIGIBLE_PLANS = ["PREMIUM", "ENTERPRISE"] as const;

export type EntitlementOrganization = {
  plan: string;
  aiAddonActive: boolean;
};

export type EntitlementApplication = {
  aiEnabled: boolean;
  aiAutoRespond: boolean;
};

export function isAiTurnEntitled(input: {
  organization: EntitlementOrganization;
  application: EntitlementApplication;
}): boolean {
  const { organization, application } = input;
  const eligiblePlan = ADDON_ELIGIBLE_PLANS.includes(
    organization.plan as (typeof ADDON_ELIGIBLE_PLANS)[number],
  );
  return (
    eligiblePlan &&
    organization.aiAddonActive &&
    application.aiEnabled &&
    application.aiAutoRespond
  );
}
