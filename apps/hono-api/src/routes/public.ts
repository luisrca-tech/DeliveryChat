import { Hono } from "hono";
import { stripe } from "../lib/stripe.js";
import { env } from "../env.js";
import {
  getApiKeyLimitByPlan,
  getMemberLimitByPlan,
  getAiLimitsByPlan,
} from "../lib/planLimits.js";
import { createVisitorRateLimitMiddleware } from "../lib/middleware/visitorRateLimit.js";
import { sharedVisitorRateLimiter } from "../lib/middleware/visitorRateLimitInstance.js";

/**
 * Public, unauthenticated marketing endpoint — no tenant resolution, no auth.
 * Dogfooded as an AI DataTool so the widget's AI can answer pricing
 * questions from live data. See docs/public-plans.md and
 * features/ai-data/docs/data-tool-management.md ("Dogfooding").
 */

type PlanId = "FREE" | "BASIC" | "PREMIUM" | "ENTERPRISE";

type MoneyAmount = { amount: number; formatted: string };
type PlanPrices = { brl: MoneyAmount; usd: MoneyAmount } | "custom" | null;

type PlanEntry = {
  id: PlanId;
  name: string;
  prices: PlanPrices;
  limits: {
    apiKeys: number;
    members: number;
    aiAssistant: boolean;
    aiMonthlyCap: number;
  };
};

type StripePriceLike = {
  unit_amount?: number | null;
  currency?: string;
  currency_options?: Record<string, { unit_amount?: number | null }>;
};

const CACHE_TTL_MS = 10 * 60 * 1000;

let cache: { plans: PlanEntry[]; fetchedAt: number } | null = null;

function buildLimits(plan: PlanId) {
  const ai = getAiLimitsByPlan(plan);
  return {
    apiKeys: getApiKeyLimitByPlan(plan),
    members: getMemberLimitByPlan(plan),
    aiAssistant: ai.aiAssistantEnabled,
    aiMonthlyCap: ai.aiMonthlyCap,
  };
}

function formatMoney(amountCents: number, currency: "brl" | "usd"): MoneyAmount {
  const value = amountCents / 100;
  const displayValue = Number.isInteger(value) ? String(value) : value.toFixed(2);
  const prefix = currency === "brl" ? "R$ " : "$";
  return { amount: amountCents, formatted: `${prefix}${displayValue}/month` };
}

function extractAmount(
  price: StripePriceLike,
  currency: "brl" | "usd",
): number | null {
  if (price.currency?.toLowerCase() === currency) {
    return typeof price.unit_amount === "number" ? price.unit_amount : null;
  }
  const option = price.currency_options?.[currency];
  return typeof option?.unit_amount === "number" ? option.unit_amount : null;
}

function buildPrices(price: StripePriceLike): PlanPrices {
  const brlAmount = extractAmount(price, "brl");
  const usdAmount = extractAmount(price, "usd");
  if (brlAmount === null || usdAmount === null) {
    return null;
  }
  return {
    brl: formatMoney(brlAmount, "brl"),
    usd: formatMoney(usdAmount, "usd"),
  };
}

function buildPlanEntries(
  basicPrices: PlanPrices,
  premiumPrices: PlanPrices,
): PlanEntry[] {
  return [
    { id: "FREE", name: "Free", prices: null, limits: buildLimits("FREE") },
    {
      id: "BASIC",
      name: "Basic",
      prices: basicPrices,
      limits: buildLimits("BASIC"),
    },
    {
      id: "PREMIUM",
      name: "Premium",
      prices: premiumPrices,
      limits: buildLimits("PREMIUM"),
    },
    {
      id: "ENTERPRISE",
      name: "Enterprise",
      prices: "custom",
      limits: buildLimits("ENTERPRISE"),
    },
  ];
}

async function fetchLivePrices(): Promise<{
  basic: PlanPrices;
  premium: PlanPrices;
}> {
  const [basicPrice, premiumPrice] = await Promise.all([
    stripe.prices.retrieve(env.STRIPE_BASIC_PRICE_KEY, {
      expand: ["currency_options"],
    }),
    stripe.prices.retrieve(env.STRIPE_PREMIUM_PRICE_KEY, {
      expand: ["currency_options"],
    }),
  ]);

  return {
    basic: buildPrices(basicPrice as unknown as StripePriceLike),
    premium: buildPrices(premiumPrice as unknown as StripePriceLike),
  };
}

async function getPlans(): Promise<PlanEntry[]> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.plans;
  }

  try {
    const { basic, premium } = await fetchLivePrices();
    const plans = buildPlanEntries(basic, premium);
    cache = { plans, fetchedAt: now };
    return plans;
  } catch (error) {
    console.error(
      "Failed to fetch live Stripe prices for /public/plans — falling back to prices: null:",
      error,
    );
    if (cache) {
      return cache.plans;
    }
    return buildPlanEntries(null, null);
  }
}

export const publicRoute = new Hono()
  .use(
    "/plans",
    createVisitorRateLimitMiddleware(sharedVisitorRateLimiter),
  )
  .get("/plans", async (c) => {
    const plans = await getPlans();
    return c.json(
      { plans },
      200,
      {
        "Cache-Control": "public, max-age=300",
      },
    );
  });
