/**
 * Org-level + per-application entitlement for the autonomous AI assistant.
 *
 * A conversation may only be AI-handled when ALL hold:
 *   1. the org plan is add-on eligible (PREMIUM or ENTERPRISE),
 *   2. the AI add-on is actually active (`aiAddonActive`, derived from Stripe),
 *   3. the application has AI enabled, and
 *   4. the application opted into auto-responding.
 *
 * Conditions 1–2 (the org half) are delegated to the shared `isAddonEntitled`
 * seam (`features/ai/entitlement`), so the plan-eligibility rule lives in exactly
 * one place. This function stays the single source of truth for the full
 * 4-condition check used both when deciding the initial `handledBy` mode at
 * conversation creation and when guarding each AI turn.
 */
import {
  isAddonEntitled,
  type EntitlementOrganization,
} from "../ai/entitlement.js";

export type { EntitlementOrganization };

export type EntitlementApplication = {
  aiEnabled: boolean;
  aiAutoRespond: boolean;
};

export function isAiTurnEntitled(input: {
  organization: EntitlementOrganization;
  application: EntitlementApplication;
}): boolean {
  const { organization, application } = input;
  return (
    isAddonEntitled(organization) &&
    application.aiEnabled &&
    application.aiAutoRespond
  );
}
