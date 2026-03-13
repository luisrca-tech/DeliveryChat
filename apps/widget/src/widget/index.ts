(function () {
  const w = globalThis as unknown as {
    DeliveryChat?: { queue?: unknown[]; init?: (o: unknown) => void };
  };
  w.DeliveryChat = w.DeliveryChat ?? { queue: [] };
  if (!w.DeliveryChat.init) {
    w.DeliveryChat.init = function (o: unknown) {
      (w.DeliveryChat!.queue = w.DeliveryChat!.queue ?? []).push(["init", o]);
    };
  }
})();

import {
  defaultSettings,
  type InitOptions,
  type WidgetSettings,
} from "./types.js";
import {
  createShadowHost,
  createShadowRoot,
  destroyHost,
} from "./utils/shadow-dom.js";
import { applyCssVars } from "./utils/css-vars.js";
import { createLauncher } from "./components/Launcher.js";
import {
  createChatWindow,
  getMessageListEl,
  appendMessage,
} from "./components/ChatWindow.js";
import { getState, setState } from "./state.js";
import { fetchSettings } from "./api.js";
import { getApiBaseUrl } from "./config.js";

import styles from "./styles/main.css?inline";

const HOST_ID = "delivery-chat-root";
const MAX_MESSAGES = 100;

let cleanupFns: Array<() => void> = [];

function runCleanup(): void {
  for (const fn of cleanupFns) fn();
  cleanupFns = [];
}

function mergeSettings(
  api: Partial<WidgetSettings>,
  init: InitOptions,
): WidgetSettings {
  const base = { ...defaultSettings, ...api } as WidgetSettings;
  const overrides = buildInitOverrides(base, init);
  return { ...base, ...overrides };
}

function buildInitOverrides(
  base: WidgetSettings,
  init: InitOptions,
): Partial<WidgetSettings> {
  const overrides: Partial<WidgetSettings> = {};
  if (init.position)
    overrides.position = { ...base.position, corner: init.position };
  if (init.autoOpen !== undefined)
    overrides.behavior = { ...base.behavior, autoOpen: init.autoOpen };
  if (init.autoOpenDelay !== undefined)
    overrides.behavior = {
      ...(overrides.behavior ?? base.behavior),
      autoOpenDelay: init.autoOpenDelay,
    };
  if (init.colors) overrides.colors = { ...base.colors, ...init.colors };
  return overrides;
}

function deepMergeWidgetSettings(
  target: WidgetSettings,
  source: Record<string, unknown>,
): Partial<WidgetSettings> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(defaultSettings) as (keyof WidgetSettings)[]) {
    const v = source[key];
    if (v != null && typeof v === "object" && !Array.isArray(v)) {
      const merged = { ...(target[key] as object), ...(v as object) };
      out[key] = merged;
    } else if (v !== undefined) {
      out[key] = v;
    }
  }
  return out as Partial<WidgetSettings>;
}

function render(shadow: ShadowRoot, settings: WidgetSettings): void {
  const corner = settings.position.corner;
  const wrapper = document.createElement("div");
  wrapper.className = "chat-widget";
  wrapper.setAttribute("data-corner", corner);

  applyCssVars(wrapper, settings);

  const launcher = createLauncher({
    corner,
    label: settings.launcher.label,
    icon: settings.launcher.icon,
  });

  let chatWindowEl: HTMLElement;
  const onSend = (text: string) => {
    const id = crypto.randomUUID();
    const next = [...getState("messages"), { id, text, role: "user" }];
    const trimmed = next.slice(-MAX_MESSAGES);
    setState("messages", trimmed);
    const listEl = getMessageListEl(chatWindowEl);
    if (listEl) {
      while (listEl.children.length >= MAX_MESSAGES)
        listEl.firstChild?.remove();
      appendMessage(listEl, { id, text, role: "user" });
    }
  };

  let isOpen = getState("isOpen");
  const closeChat = () => {
    isOpen = false;
    setState("isOpen", false);
    chatWindowEl!.hidden = true;
    launcher.setAttribute("aria-expanded", "false");
    launcher.focus();
  };

  chatWindowEl = createChatWindow(
    settings,
    getState("messages"),
    onSend,
    closeChat,
  );
  const chatWindow = chatWindowEl;
  chatWindow.hidden = !isOpen;

  let focusTrapAbort: AbortController | null = null;

  launcher.addEventListener("click", () => {
    isOpen = !isOpen;
    setState("isOpen", isOpen);
    chatWindow.hidden = !isOpen;
    launcher.setAttribute("aria-expanded", String(isOpen));
    if (isOpen) {
      focusTrapAbort?.abort();
      focusTrapAbort = new AbortController();
      focusTrap(chatWindow, focusTrapAbort.signal);
    } else {
      focusTrapAbort?.abort();
    }
  });

  wrapper.appendChild(launcher);
  wrapper.appendChild(chatWindow);
  shadow.appendChild(wrapper);

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && isOpen) closeChat();
  };
  document.addEventListener("keydown", handleKeydown);
  cleanupFns.push(() => document.removeEventListener("keydown", handleKeydown));
}

function focusTrap(container: HTMLElement, signal?: AbortSignal): void {
  const focusables = container.querySelectorAll<HTMLElement>(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  );
  if (focusables.length === 0) return;

  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  first?.focus();

  const handler = (e: KeyboardEvent) => {
    if (e.key !== "Tab") return;
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  };
  container.addEventListener("keydown", handler, { signal });
}

async function init(opts: InitOptions): Promise<void> {
  if (!opts?.appId || typeof opts.appId !== "string") {
    console.warn("[DeliveryChat] appId is required");
    return;
  }

  runCleanup();
  const existing = document.getElementById(HOST_ID);
  if (existing) existing.remove();

  const apiBaseUrl = getApiBaseUrl();
  let apiSettings: Partial<WidgetSettings> = {};
  if (apiBaseUrl) {
    try {
      const raw = await fetchSettings(apiBaseUrl, opts.appId);
      if (raw)
        apiSettings = deepMergeWidgetSettings(
          defaultSettings,
          raw,
        ) as Partial<WidgetSettings>;
    } catch (e) {
      console.warn("[DeliveryChat] Failed to fetch settings:", e);
    }
  }

  const settings = mergeSettings(apiSettings, opts);
  setState("settings", settings);
  setState("isOpen", false);
  setState("messages", []);

  const host = createShadowHost();
  const shadow = createShadowRoot(host);

  const style = document.createElement("style");
  style.textContent = styles;
  shadow.appendChild(style);

  render(shadow, settings);

  if (settings.behavior.autoOpen) {
    setTimeout(() => {
      setState("isOpen", true);
      const chatWindow = shadow.querySelector(".chat-window") as HTMLElement;
      const launcher = shadow.querySelector(".launcher") as HTMLElement;
      if (chatWindow) chatWindow.hidden = false;
      if (launcher) launcher.setAttribute("aria-expanded", "true");
    }, settings.behavior.autoOpenDelay);
  }
}

function destroy(): void {
  runCleanup();
  destroyHost();
}

const w = window as unknown as { DeliveryChat?: { queue?: unknown[] } };
const queue = w.DeliveryChat?.queue;
if (Array.isArray(queue)) {
  for (const item of queue) {
    if (Array.isArray(item) && item[0] === "init") {
      init(item[1] as InitOptions);
    }
  }
}

export type DeliveryChatAPI = {
  init: (opts: InitOptions) => void;
  destroy: () => void;
  queue: unknown[];
};

const DeliveryChat: DeliveryChatAPI = {
  init: (opts: InitOptions) => void init(opts),
  destroy,
  queue: [] as unknown[],
};

declare global {
  interface Window {
    DeliveryChat: DeliveryChatAPI;
  }
}

if (typeof window !== "undefined") {
  (window as Window).DeliveryChat = DeliveryChat;
}

export { init, destroy };
