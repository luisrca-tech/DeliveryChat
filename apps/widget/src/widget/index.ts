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
  updateMessageContent,
  markMessageDeleted,
  enterEditMode,
  exitEditMode,
  type BubbleContext,
} from "./components/ChatWindow.js";
import { getState, setState, subscribe } from "./state.js";
import { fetchSettings } from "./api.js";
import { getApiBaseUrl, setApiBaseUrl } from "./config.js";
import { isValidLauncherImageUrl } from "./utils/logo-url.js";
import {
  initChatController,
  openChat as controllerOpenChat,
  sendMessage as controllerSendMessage,
  editMessage as controllerEditMessage,
  deleteMessage as controllerDeleteMessage,
  notifyTypingStart,
  notifyTypingStop,
  destroyChat,
  startNewChat,
} from "./chat-controller.js";
import type { ChatMessage } from "./types.js";

import styles from "./styles/main.css?inline";

const HOST_ID = "delivery-chat-root";
const MAX_MESSAGES = 100;

let cleanupFns: Array<() => void> = [];
let autoOpenTimeout: ReturnType<typeof setTimeout> | null = null;

function runCleanup(): void {
  for (const fn of cleanupFns) fn();
  cleanupFns = [];
  if (autoOpenTimeout !== null) {
    clearTimeout(autoOpenTimeout);
    autoOpenTimeout = null;
  }
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
  if (init.launcherLogoUrl !== undefined) {
    overrides.launcher = {
      ...(overrides.launcher ?? base.launcher),
      ...(init.launcherLogoUrl === null
        ? { logoUrl: undefined }
        : { logoUrl: init.launcherLogoUrl }),
    };
  }
  return overrides;
}

function resolveLauncherLogoUrl(
  settings: WidgetSettings,
  init: InitOptions,
  apiBaseUrl: string,
): void {
  const base = apiBaseUrl.replace(/\/$/, "");
  const brandDefault = `${base}/brand/logo.png?v=${Date.now()}`;

  if (init.launcherLogoUrl === null) {
    const { logoUrl, ...launcherRest } = settings.launcher;
    void logoUrl;
    settings.launcher = launcherRest as WidgetSettings["launcher"];
    return;
  }
  if (
    typeof init.launcherLogoUrl === "string" &&
    init.launcherLogoUrl.trim() !== ""
  ) {
    settings.launcher = {
      ...settings.launcher,
      logoUrl: init.launcherLogoUrl.trim(),
    };
    return;
  }
  if (isValidLauncherImageUrl(settings.launcher.logoUrl)) {
    settings.launcher = {
      ...settings.launcher,
      logoUrl: settings.launcher.logoUrl!.trim(),
    };
    return;
  }
  settings.launcher = { ...settings.launcher, logoUrl: brandDefault };
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
    logoUrl: settings.launcher.logoUrl,
  });

  const backdrop = document.createElement("div");
  backdrop.className = "chat-dismiss-backdrop";
  backdrop.hidden = true;
  backdrop.setAttribute("aria-hidden", "true");

  const bubbleCtx: BubbleContext = {
    visitorId: getState("visitorId"),
    onEdit: (messageId, _content) => {
      setState("editingMessageId", messageId);
    },
    onDelete: (messageId) => {
      controllerDeleteMessage(messageId);
    },
  };

  // eslint-disable-next-line prefer-const
  let chatWindowEl: HTMLElement;

  let isOpen = getState("isOpen");
  const closeChat = () => {
    isOpen = false;
    setState("isOpen", false);
    chatWindowEl!.hidden = true;
    backdrop.hidden = true;
    launcher.setAttribute("aria-expanded", "false");
    launcher.focus();
  };

  chatWindowEl = createChatWindow(
    settings,
    getState("messages"),
    {
      onSend: (text) => controllerSendMessage(text),
      onTypingStart: notifyTypingStart,
      onTypingStop: notifyTypingStop,
      onClose: closeChat,
    },
    bubbleCtx,
  );
  const chatWindow = chatWindowEl;
  chatWindow.hidden = !isOpen;

  let focusTrapAbort: AbortController | null = null;

  backdrop.addEventListener("click", () => {
    if (isOpen) closeChat();
  });

  launcher.addEventListener("click", () => {
    isOpen = !isOpen;
    setState("isOpen", isOpen);
    chatWindow.hidden = !isOpen;
    backdrop.hidden = !isOpen;
    launcher.setAttribute("aria-expanded", String(isOpen));
    if (isOpen) {
      controllerOpenChat();
      focusTrapAbort?.abort();
      focusTrapAbort = new AbortController();
      focusTrap(chatWindow, focusTrapAbort.signal);
    } else {
      focusTrapAbort?.abort();
    }
  });

  // "Start new chat" button (replaces input area when conversation is closed)
  const newChatBtn = document.createElement("button");
  newChatBtn.type = "button";
  newChatBtn.className = "new-chat-btn";
  newChatBtn.textContent = "Start new chat";
  newChatBtn.hidden = true;
  newChatBtn.addEventListener("click", () => {
    startNewChat();
  });
  chatWindowEl.appendChild(newChatBtn);

  wrapper.appendChild(backdrop);
  wrapper.appendChild(launcher);
  wrapper.appendChild(chatWindow);
  shadow.appendChild(wrapper);

  // Status banner for conversation state
  const statusBanner = document.createElement("div");
  statusBanner.className = "status-banner";
  statusBanner.hidden = true;
  // Insert banner between header and message list
  const messageListEl = chatWindow.querySelector(".message-list");
  if (messageListEl) {
    chatWindow.insertBefore(statusBanner, messageListEl);
  }

  const inputAreaEl = chatWindow.querySelector(".input-area") as HTMLElement | null;

  const errorBanner = document.createElement("div");
  errorBanner.className = "error-banner";
  errorBanner.hidden = true;
  errorBanner.setAttribute("role", "alert");
  if (messageListEl) {
    chatWindow.insertBefore(errorBanner, statusBanner.nextSibling ?? messageListEl);
  }

  const unsubConnError = subscribe("connectionError", (error) => {
    if (!error) {
      errorBanner.hidden = true;
      errorBanner.className = "error-banner";
      if (inputAreaEl) {
        inputAreaEl.classList.remove("input-disabled");
        const input = inputAreaEl.querySelector("input") as HTMLInputElement | null;
        const btn = inputAreaEl.querySelector("button") as HTMLButtonElement | null;
        if (input) input.disabled = false;
        if (btn) btn.disabled = false;
      }
      return;
    }

    errorBanner.textContent = error.userMessage;
    errorBanner.hidden = false;
    errorBanner.className = error.type === "permanent"
      ? "error-banner error-permanent"
      : "error-banner error-temporary";

    if (error.type === "permanent" && inputAreaEl) {
      inputAreaEl.classList.add("input-disabled");
      const input = inputAreaEl.querySelector("input") as HTMLInputElement | null;
      const btn = inputAreaEl.querySelector("button") as HTMLButtonElement | null;
      if (input) input.disabled = true;
      if (btn) btn.disabled = true;
    }
  });
  cleanupFns.push(unsubConnError);

  const unsubConvStatus = subscribe("conversationStatus", (status) => {
    if (status === "pending") {
      statusBanner.textContent = "Waiting for support...";
      statusBanner.hidden = false;
      statusBanner.className = "status-banner status-pending";
      if (inputAreaEl) inputAreaEl.hidden = false;
      newChatBtn.hidden = true;
    } else if (status === "active") {
      statusBanner.textContent = "Connected with support";
      statusBanner.hidden = false;
      statusBanner.className = "status-banner status-active";
      setTimeout(() => { statusBanner.hidden = true; }, 3000);
      if (inputAreaEl) inputAreaEl.hidden = false;
      newChatBtn.hidden = true;
    } else if (status === "closed") {
      statusBanner.textContent = "Conversation resolved";
      statusBanner.hidden = false;
      statusBanner.className = "status-banner status-closed";
      if (inputAreaEl) inputAreaEl.hidden = true;
      newChatBtn.hidden = false;
    } else {
      statusBanner.hidden = true;
      if (inputAreaEl) inputAreaEl.hidden = false;
      newChatBtn.hidden = true;
    }
  });
  cleanupFns.push(unsubConvStatus);

  let lastMessageCount = getState("messages").length;
  const renderedMessages = new Map<string, ChatMessage>();

  // Initialize rendered messages cache
  for (const msg of getState("messages")) {
    renderedMessages.set(msg.id, msg);
  }

  const unsubMessages = subscribe("messages", (messages: ChatMessage[]) => {
    const listEl = getMessageListEl(chatWindow);
    if (!listEl) return;

    // Full reset (conversation change)
    if (messages.length < lastMessageCount) {
      const typingEl = listEl.querySelector(".typing-indicator");
      listEl.innerHTML = "";
      if (typingEl) listEl.appendChild(typingEl);
      lastMessageCount = 0;
      renderedMessages.clear();
      return;
    }

    // Detect in-place edits/deletes on existing messages
    for (const msg of messages) {
      const prev = renderedMessages.get(msg.id);
      if (prev && prev !== msg) {
        if (msg.isDeleted && !prev.isDeleted) {
          markMessageDeleted(listEl, msg.id);
        } else if (msg.content !== prev.content || msg.editedAt !== prev.editedAt) {
          updateMessageContent(listEl, msg.id, msg.content, msg.editedAt);
        }
      }
      renderedMessages.set(msg.id, msg);
    }

    // Append new messages
    for (let i = lastMessageCount; i < messages.length; i++) {
      const msg = messages[i];
      if (msg) {
        while (listEl.children.length >= MAX_MESSAGES)
          listEl.firstChild?.remove();
        appendMessage(listEl, msg, bubbleCtx);
      }
    }
    lastMessageCount = messages.length;
  });
  cleanupFns.push(unsubMessages);

  // Edit mode subscription
  const unsubEditing = subscribe("editingMessageId", (editingId: string | null) => {
    const listEl = getMessageListEl(chatWindow);
    if (!listEl) return;

    // Exit any previous edit mode — .message-editing is on the bubble,
    // but data-id is on the parent .message-row
    listEl.querySelectorAll(".message-editing").forEach((bubble) => {
      const row = bubble.closest(".message-row");
      const msgId = row?.getAttribute("data-id") ?? null;
      if (msgId && msgId !== editingId) {
        const msg = getState("messages").find((m) => m.id === msgId);
        exitEditMode(listEl, msgId, msg?.content ?? "", msg?.editedAt);
      }
    });

    // Also handle the case where editingId is null — exit ALL edit modes
    if (!editingId) {
      listEl.querySelectorAll(".edit-container").forEach((container) => {
        const row = container.closest(".message-row");
        const msgId = row?.getAttribute("data-id") ?? null;
        if (msgId) {
          const msg = getState("messages").find((m) => m.id === msgId);
          exitEditMode(listEl, msgId, msg?.content ?? "", msg?.editedAt);
        }
      });
      return;
    }

    const msg = getState("messages").find((m) => m.id === editingId);
    if (msg && !msg.isDeleted) {
      enterEditMode(
        listEl,
        editingId,
        msg.content,
        (newContent) => controllerEditMessage(editingId, newContent),
        () => setState("editingMessageId", null),
      );
    }
  });
  cleanupFns.push(unsubEditing);

  const typingEl = chatWindow.querySelector(".typing-indicator") as HTMLElement | null;
  const unsubTyping = subscribe("typingUser", (typingUser) => {
    if (!typingEl) return;
    if (typingUser) {
      typingEl.textContent =
        typingUser.senderRole === "visitor"
          ? "Visitor is typing..."
          : `${typingUser.userName ?? "Agent"} is typing...`;
      typingEl.hidden = false;
      const listEl = getMessageListEl(chatWindow);
      if (listEl) listEl.scrollTop = listEl.scrollHeight;
    } else {
      typingEl.hidden = true;
      typingEl.textContent = "";
    }
  });
  cleanupFns.push(unsubTyping);

  const badgeEl = launcher.querySelector(".launcher-badge") as HTMLElement | null;
  const unsubUnread = subscribe("unreadCount", (count: number) => {
    if (!badgeEl) return;
    if (count > 0) {
      badgeEl.textContent = count > 99 ? "99+" : String(count);
      badgeEl.hidden = false;
    } else {
      badgeEl.hidden = true;
    }
  });
  cleanupFns.push(unsubUnread);

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

  if (opts.apiBaseUrl) {
    setApiBaseUrl(opts.apiBaseUrl);
  }

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
  resolveLauncherLogoUrl(settings, opts, apiBaseUrl);
  setState("settings", settings);
  setState("isOpen", false);
  setState("messages", []);

  await initChatController({ appId: opts.appId });

  const host = createShadowHost();
  const shadow = createShadowRoot(host);

  const style = document.createElement("style");
  style.textContent = styles;
  shadow.appendChild(style);

  render(shadow, settings);

  if (settings.behavior.autoOpen) {
    if (autoOpenTimeout !== null) {
      clearTimeout(autoOpenTimeout);
    }

    autoOpenTimeout = setTimeout(() => {
      setState("isOpen", true);
      const chatWindow = shadow.querySelector(".chat-window") as HTMLElement;
      const launcher = shadow.querySelector(".launcher") as HTMLElement;
      const backdropEl = shadow.querySelector(
        ".chat-dismiss-backdrop",
      ) as HTMLElement;
      if (chatWindow) chatWindow.hidden = false;
      if (launcher) launcher.setAttribute("aria-expanded", "true");
      if (backdropEl) backdropEl.hidden = false;
    }, settings.behavior.autoOpenDelay);
  }
}

function destroy(): void {
  destroyChat();
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
