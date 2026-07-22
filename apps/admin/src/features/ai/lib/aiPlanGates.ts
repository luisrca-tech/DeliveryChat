/**
 * The two AI plan gates, mirrored from hono-api. They are NOT the same gate and
 * collapsing them is what puts dead controls in front of a BASIC admin:
 *
 *   SERVING (`planAllowsServing` / `AI_LIMITS.aiAssistantEnabled`) — draft
 *     replies, improve message, answer visitors. BASIC and up.
 *
 *   ADD-ON (`planAllowsAddon` / `ADDON_ELIGIBLE_PLANS`) — AI auto-respond and
 *     SQL data tools. PREMIUM and up, and only while the AI Assistant add-on is
 *     purchased. BASIC may be served by the AI but can never HOLD the add-on
 *     (`POST /billing/ai-addon` rejects it with `plan_not_eligible`), so any UI
 *     that unlocks add-on capabilities must gate on `planAllowsAddon`.
 */
const AI_SERVING_PLANS = new Set(["BASIC", "PREMIUM", "ENTERPRISE"]);
const AI_ADDON_ELIGIBLE_PLANS = new Set(["PREMIUM", "ENTERPRISE"]);

/** Plans the AI assistant may be served on (drafts, replies). */
export function planAllowsServing(plan: string | null | undefined): boolean {
  return plan ? AI_SERVING_PLANS.has(plan) : false;
}

/** Plans that may hold the AI Assistant add-on (auto-respond, data tools). */
export function planAllowsAddon(plan: string | null | undefined): boolean {
  return plan ? AI_ADDON_ELIGIBLE_PLANS.has(plan) : false;
}

/**
 * Why the add-on capabilities (auto-respond, data tools) are unavailable, or
 * `null` when they are available. The three locked states need three different
 * messages, and getting them wrong strands the admin:
 *
 *   "free_plan"      — FREE: the AI does not serve this org at all. Subscribe.
 *   "upgrade_plan"   — BASIC: the AI serves drafts, but the add-on is out of
 *                      reach on this tier. Upgrade to Premium/Enterprise.
 *   "addon_inactive" — PREMIUM/ENTERPRISE without the add-on (never bought, or
 *                      cancelled). Nothing to upgrade — just buy the add-on.
 */
export type AiLockState = "free_plan" | "upgrade_plan" | "addon_inactive";

export function resolveAiLock(
  plan: string | null | undefined,
  aiAddonActive: boolean,
): AiLockState | null {
  if (!planAllowsAddon(plan)) {
    return planAllowsServing(plan) ? "upgrade_plan" : "free_plan";
  }
  return aiAddonActive ? null : "addon_inactive";
}
