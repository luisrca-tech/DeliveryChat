import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";

const mockPricesRetrieve = vi.fn();

vi.mock("../../../lib/stripe.js", () => ({
  stripe: {
    prices: {
      retrieve: (...args: unknown[]) => mockPricesRetrieve(...args),
    },
  },
}));

vi.mock("../../../env.js", () => ({
  env: {
    STRIPE_BASIC_PRICE_KEY: "price_basic",
    STRIPE_PREMIUM_PRICE_KEY: "price_premium",
  },
}));

const basicPriceFixture = {
  id: "price_basic",
  unit_amount: 9000,
  currency: "brl",
  currency_options: { usd: { unit_amount: 1900 } },
};

const premiumPriceFixture = {
  id: "price_premium",
  unit_amount: 19000,
  currency: "brl",
  currency_options: { usd: { unit_amount: 3900 } },
};

async function loadPublicRoute() {
  vi.resetModules();
  const { publicRoute } = await import("../index.js");
  return new Hono().route("/public", publicRoute);
}

describe("GET /public/plans", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns live Stripe prices for BASIC and PREMIUM in both currencies", async () => {
    mockPricesRetrieve.mockImplementation((id: string) =>
      id === "price_basic"
        ? Promise.resolve(basicPriceFixture)
        : Promise.resolve(premiumPriceFixture),
    );
    const app = await loadPublicRoute();

    const res = await app.request("/public/plans");
    expect(res.status).toBe(200);
    const body = await res.json();

    const basic = body.plans.find((p: { id: string }) => p.id === "BASIC");
    expect(basic.prices).toEqual({
      brl: { amount: 9000, formatted: "R$ 90/month" },
      usd: { amount: 1900, formatted: "$19/month" },
    });

    const premium = body.plans.find((p: { id: string }) => p.id === "PREMIUM");
    expect(premium.prices).toEqual({
      brl: { amount: 19000, formatted: "R$ 190/month" },
      usd: { amount: 3900, formatted: "$39/month" },
    });
  });

  it("sets Cache-Control: public, max-age=300", async () => {
    mockPricesRetrieve.mockResolvedValue(basicPriceFixture);
    const app = await loadPublicRoute();

    const res = await app.request("/public/plans");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300");
  });

  it("FREE has null prices", async () => {
    mockPricesRetrieve.mockResolvedValue(basicPriceFixture);
    const app = await loadPublicRoute();

    const res = await app.request("/public/plans");
    const body = await res.json();
    const free = body.plans.find((p: { id: string }) => p.id === "FREE");
    expect(free.prices).toBeNull();
  });

  it("ENTERPRISE has prices 'custom'", async () => {
    mockPricesRetrieve.mockResolvedValue(basicPriceFixture);
    const app = await loadPublicRoute();

    const res = await app.request("/public/plans");
    const body = await res.json();
    const enterprise = body.plans.find(
      (p: { id: string }) => p.id === "ENTERPRISE",
    );
    expect(enterprise.prices).toBe("custom");
  });

  it("limits match planLimits values for every plan", async () => {
    mockPricesRetrieve.mockResolvedValue(basicPriceFixture);
    const app = await loadPublicRoute();

    const res = await app.request("/public/plans");
    const body = await res.json();

    const byId = Object.fromEntries(
      body.plans.map((p: { id: string }) => [p.id, p]),
    );

    expect(byId.FREE.limits).toEqual({
      apiKeys: 3,
      members: 3,
      aiAssistant: false,
      aiMonthlyCap: 0,
    });
    expect(byId.BASIC.limits).toEqual({
      apiKeys: 5,
      members: 6,
      aiAssistant: false,
      aiMonthlyCap: 0,
    });
    expect(byId.PREMIUM.limits).toEqual({
      apiKeys: 10,
      members: 15,
      aiAssistant: true,
      aiMonthlyCap: 3000,
    });
    expect(byId.ENTERPRISE.limits).toEqual({
      apiKeys: 1000,
      members: 1000,
      aiAssistant: true,
      aiMonthlyCap: 3000,
    });
  });

  it("on Stripe failure, logs and serves limits with prices: null (never 500)", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mockPricesRetrieve.mockRejectedValue(new Error("stripe unreachable"));
    const app = await loadPublicRoute();

    const res = await app.request("/public/plans");
    expect(res.status).toBe(200);
    const body = await res.json();

    const basic = body.plans.find((p: { id: string }) => p.id === "BASIC");
    const premium = body.plans.find((p: { id: string }) => p.id === "PREMIUM");
    expect(basic.prices).toBeNull();
    expect(premium.prices).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("caches: Stripe is called once across two requests within the TTL", async () => {
    mockPricesRetrieve.mockImplementation((id: string) =>
      id === "price_basic"
        ? Promise.resolve(basicPriceFixture)
        : Promise.resolve(premiumPriceFixture),
    );
    const app = await loadPublicRoute();

    await app.request("/public/plans");
    await app.request("/public/plans");

    // 2 prices (basic + premium) retrieved once per cache fill
    expect(mockPricesRetrieve).toHaveBeenCalledTimes(2);
  });

  it("honors cache TTL expiry — refetches after 10 minutes", async () => {
    vi.useFakeTimers();
    mockPricesRetrieve.mockImplementation((id: string) =>
      id === "price_basic"
        ? Promise.resolve(basicPriceFixture)
        : Promise.resolve(premiumPriceFixture),
    );
    const app = await loadPublicRoute();

    await app.request("/public/plans");
    expect(mockPricesRetrieve).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(9 * 60 * 1000);
    await app.request("/public/plans");
    // still within TTL — no refetch
    expect(mockPricesRetrieve).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(2 * 60 * 1000);
    await app.request("/public/plans");
    // TTL expired — refetch
    expect(mockPricesRetrieve).toHaveBeenCalledTimes(4);
  });

  it("serves stale cache when Stripe fails after a successful fetch", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    vi.useFakeTimers();
    mockPricesRetrieve.mockImplementation((id: string) =>
      id === "price_basic"
        ? Promise.resolve(basicPriceFixture)
        : Promise.resolve(premiumPriceFixture),
    );
    const app = await loadPublicRoute();

    const first = await app.request("/public/plans");
    const firstBody = await first.json();
    const firstBasic = firstBody.plans.find(
      (p: { id: string }) => p.id === "BASIC",
    );
    expect(firstBasic.prices).not.toBeNull();

    vi.advanceTimersByTime(11 * 60 * 1000);
    mockPricesRetrieve.mockRejectedValue(new Error("stripe down"));

    const second = await app.request("/public/plans");
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    const secondBasic = secondBody.plans.find(
      (p: { id: string }) => p.id === "BASIC",
    );
    expect(secondBasic.prices).toEqual(firstBasic.prices);
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
