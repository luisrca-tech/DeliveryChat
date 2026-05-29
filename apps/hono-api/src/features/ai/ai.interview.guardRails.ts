import type { GuardRailAction } from "./ai.interview.schema.js";

export type GuardRailRules = {
  advanceTurn: boolean;
  persistMarker: "garbage_pushback" | null;
  suppressFinishReprompt: boolean;
};

export const GUARD_RAIL_RULES: Record<GuardRailAction, GuardRailRules> = {
  none: {
    advanceTurn: true,
    persistMarker: null,
    suppressFinishReprompt: false,
  },
  redirect_scope: {
    advanceTurn: false,
    persistMarker: null,
    suppressFinishReprompt: true,
  },
  block_extraction: {
    advanceTurn: false,
    persistMarker: null,
    suppressFinishReprompt: true,
  },
  pushback_garbage: {
    advanceTurn: true,
    persistMarker: "garbage_pushback",
    suppressFinishReprompt: false,
  },
  accept_garbage: {
    advanceTurn: true,
    persistMarker: null,
    suppressFinishReprompt: false,
  },
};
