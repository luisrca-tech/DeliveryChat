import { setState } from "./state.js";

const CONV_STORAGE_PREFIX = "dc_conv_";
const LAST_MSG_STORAGE_PREFIX = "dc_lastmsg_";

let activeAppId: string | null = null;

export function setActiveAppIdForPersistence(appId: string | null): void {
  activeAppId = appId;
}

export function loadPersistedConversationId(appId: string): string | null {
  try {
    return localStorage.getItem(`${CONV_STORAGE_PREFIX}${appId}`);
  } catch {
    return null;
  }
}

export function saveConversationId(appId: string, conversationId: string): void {
  try {
    localStorage.setItem(`${CONV_STORAGE_PREFIX}${appId}`, conversationId);
  } catch {
    // Ignore
  }
}

export function saveLastClientMessageId(appId: string, clientMessageId: string): void {
  try {
    localStorage.setItem(`${LAST_MSG_STORAGE_PREFIX}${appId}`, clientMessageId);
  } catch {
    // Ignore
  }
}

export function clearStaleConversationPersistence(): void {
  if (!activeAppId) return;
  try {
    localStorage.removeItem(`${CONV_STORAGE_PREFIX}${activeAppId}`);
    localStorage.removeItem(`${LAST_MSG_STORAGE_PREFIX}${activeAppId}`);
  } catch {
    // Ignore
  }
  setState("conversationId", null);
  setState("conversationStatus", null);
}

export function removeAllConversationKeysForApp(appId: string): void {
  try {
    localStorage.removeItem(`${CONV_STORAGE_PREFIX}${appId}`);
    localStorage.removeItem(`${LAST_MSG_STORAGE_PREFIX}${appId}`);
  } catch {
    // Ignore
  }
}
