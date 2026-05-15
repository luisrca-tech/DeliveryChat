import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HOST_ID } from "./constants/index.js";

vi.mock("./api.js", () => ({
  fetchSettings: vi.fn().mockResolvedValue(null),
}));

vi.mock("./config.js", () => ({
  getApiBaseUrl: vi.fn(() => "https://api.test.com"),
  setApiBaseUrl: vi.fn(),
}));

const mockSdkApi = {
  emitter: { on: vi.fn(), off: vi.fn(), emit: vi.fn(), removeAllListeners: vi.fn() },
  markInitialized: vi.fn(),
  markDestroyed: vi.fn(),
  isHeadless: vi.fn(() => false),
  initChat: vi.fn().mockResolvedValue(undefined),
  connectEagerly: vi.fn(),
  destroyChat: vi.fn(),
  openChat: vi.fn(),
  sendMessage: vi.fn().mockResolvedValue(undefined),
  editMessage: vi.fn(),
  deleteMessage: vi.fn(),
  notifyTypingStart: vi.fn(),
  notifyTypingStop: vi.fn(),
  startNewChat: vi.fn(),
};

vi.mock("./SdkApi.js", () => ({
  getSdkApi: vi.fn(() => mockSdkApi),
  resetSdkApi: vi.fn(),
}));

vi.mock("./state.js", () => {
  const state: Record<string, unknown> = {
    isOpen: false,
    messages: [],
    visitorId: "v1",
    conversationId: null,
    conversationStatus: null,
    settings: null,
    widgetVisible: true,
  };
  return {
    getState: vi.fn((key: string) => state[key]),
    setState: vi.fn((key: string, value: unknown) => {
      state[key] = typeof value === "function"
        ? (value as (p: unknown) => unknown)(state[key])
        : value;
    }),
    subscribe: vi.fn(() => () => {}),
  };
});

vi.mock("./EventBridge.js", () => ({
  connectEventBridge: vi.fn(),
  disconnectEventBridge: vi.fn(),
}));

vi.mock("./visitor.js", () => ({
  getOrCreateVisitorId: vi.fn(() => "v1"),
}));

import { init, destroy } from "./widget.js";
import { getSdkApi } from "./SdkApi.js";
import { connectEventBridge } from "./EventBridge.js";

describe("widget init — headless mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.getElementById(HOST_ID)?.remove();
  });

  afterEach(() => {
    destroy();
  });

  it("does NOT create Shadow DOM host when headless: true", async () => {
    await init({ appId: "app-1", headless: true });
    expect(document.getElementById(HOST_ID)).toBeNull();
  });

  it("still initializes chat via SdkApi when headless", async () => {
    await init({ appId: "app-1", headless: true });
    expect(mockSdkApi.initChat).toHaveBeenCalledWith({ appId: "app-1" });
  });

  it("connects event bridge when headless", async () => {
    await init({ appId: "app-1", headless: true });
    expect(connectEventBridge).toHaveBeenCalled();
  });

  it("calls connectEagerly via SdkApi when headless", async () => {
    await init({ appId: "app-1", headless: true });
    expect(mockSdkApi.connectEagerly).toHaveBeenCalled();
  });

  it("marks SDK as initialized with headless flag", async () => {
    await init({ appId: "app-1", headless: true });
    const sdkApi = getSdkApi();
    expect(sdkApi.markInitialized).toHaveBeenCalledWith({ headless: true, appId: "app-1" });
  });

  it("creates Shadow DOM host in normal (non-headless) mode", async () => {
    await init({ appId: "app-1" });
    expect(document.getElementById(HOST_ID)).not.toBeNull();
  });

  it("does NOT call connectEagerly in normal mode", async () => {
    await init({ appId: "app-1" });
    expect(mockSdkApi.connectEagerly).not.toHaveBeenCalled();
  });
});

describe("widget destroy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.getElementById(HOST_ID)?.remove();
  });

  it("calls destroyChat and markDestroyed on SdkApi", async () => {
    await init({ appId: "app-1", headless: true });
    destroy();

    expect(mockSdkApi.destroyChat).toHaveBeenCalled();
    expect(mockSdkApi.markDestroyed).toHaveBeenCalled();
  });
});
