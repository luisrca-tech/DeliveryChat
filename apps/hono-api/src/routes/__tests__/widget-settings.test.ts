import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const VALID_APP_ID = "550e8400-e29b-41d4-a716-446655440000";

vi.mock("../../db/index.js", () => ({ db: {} }));
vi.mock("../../db/schema/messages.js", () => ({ messages: {} }));
vi.mock("../../db/schema/users.js", () => ({ user: {} }));
vi.mock("../../db/schema/conversations.js", () => ({ conversations: {} }));
vi.mock("../../db/schema/applications.js", () => ({ applications: {} }));
vi.mock("../../db/schema/organization.js", () => ({ organization: {} }));
vi.mock("../../lib/security/wsToken.js", () => ({
  signWsToken: vi.fn(),
}));
vi.mock("../../env.js", () => ({ env: {} }));

const mockGetApplicationSettings = vi.fn();
vi.mock("../../features/applications/application.service.js", () => ({
  getApplicationSettings: mockGetApplicationSettings,
}));

const mockResolveInitialHandledBy = vi.fn();
vi.mock("../../features/ai-turn/resolveInitialHandledBy.js", () => ({
  resolveInitialHandledBy: mockResolveInitialHandledBy,
}));

vi.mock("../../features/chat/chat.service.js", () => ({
  createConversation: vi.fn(),
  listConversationsForVisitor: vi.fn(),
  getUnreadCountForVisitor: vi.fn(),
  markAsRead: vi.fn(),
  isParticipant: vi.fn(),
}));
vi.mock("../conversations/escalation.js", () => ({
  escalateIfAiHandled: vi.fn(),
}));
vi.mock("../../features/chat/error-mapper.js", () => ({
  mapServiceErrorToResponse: vi.fn(() => null),
}));
vi.mock("../../features/chat/visitor.service.js", () => ({
  resolveOrCreateVisitor: vi.fn(),
}));
vi.mock("../../lib/middleware/widgetAuth.js", () => ({
  requireWidgetAuth: () => async (_c: any, next: () => Promise<void>) => next(),
  getWidgetAuth: () => null,
}));
vi.mock("../../lib/middleware/visitorRateLimit.js", () => ({
  createVisitorRateLimitMiddleware:
    () => async (_c: any, next: () => Promise<void>) =>
      next(),
}));
vi.mock("../../lib/middleware/visitorRateLimitInstance.js", () => ({
  sharedVisitorRateLimiter: { check: () => ({ allowed: true }) },
}));
vi.mock("../../features/identity/identify.route.js", () => ({
  identifyRoute: new Hono(),
}));

const { widgetRoute } = await import("../widget.js");

const app = new Hono().route("/widget", widgetRoute);

describe("GET /widget/settings/:appId — ai.enabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes ai.enabled=true when the application is AI-turn entitled", async () => {
    mockGetApplicationSettings.mockResolvedValue({
      colors: { primary: "#0ea5e9" },
    });
    mockResolveInitialHandledBy.mockResolvedValue("ai");

    const res = await app.request(`/widget/settings/${VALID_APP_ID}`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.settings.ai.enabled).toBe(true);
    expect(mockResolveInitialHandledBy).toHaveBeenCalledWith(VALID_APP_ID);
  });

  it("includes ai.enabled=false when the application is not entitled", async () => {
    mockGetApplicationSettings.mockResolvedValue({
      colors: { primary: "#0ea5e9" },
    });
    mockResolveInitialHandledBy.mockResolvedValue("human");

    const res = await app.request(`/widget/settings/${VALID_APP_ID}`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.settings.ai.enabled).toBe(false);
  });

  it("preserves any pre-existing ai settings (e.g. assistantLabel)", async () => {
    mockGetApplicationSettings.mockResolvedValue({
      colors: { primary: "#0ea5e9" },
      ai: { assistantLabel: "Acme Bot" },
    });
    mockResolveInitialHandledBy.mockResolvedValue("ai");

    const res = await app.request(`/widget/settings/${VALID_APP_ID}`);

    const body = await res.json();
    expect(body.settings.ai).toEqual({
      assistantLabel: "Acme Bot",
      enabled: true,
    });
  });

  it("caps Cache-Control at max-age=60 so AI-disclosure toggles propagate quickly", async () => {
    mockGetApplicationSettings.mockResolvedValue({
      colors: { primary: "#0ea5e9" },
    });
    mockResolveInitialHandledBy.mockResolvedValue("ai");

    const res = await app.request(`/widget/settings/${VALID_APP_ID}`);

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60");
  });

  it("returns 404 when the application settings are not found", async () => {
    mockGetApplicationSettings.mockResolvedValue(null);

    const res = await app.request(`/widget/settings/${VALID_APP_ID}`);

    expect(res.status).toBe(404);
    expect(mockResolveInitialHandledBy).not.toHaveBeenCalled();
  });
});
