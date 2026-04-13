import type { WidgetSettings, ChatMessage, ConversationStatus } from "./types.js";

type Listener<T> = (value: T) => void;

export type TypingUser = {
  userId: string;
  userName: string | null;
  senderRole: string;
} | null;

export type ConnectionError = {
  type: "permanent" | "temporary";
  userMessage: string;
  devMessage: string;
} | null;

type State = {
  settings: WidgetSettings;
  isOpen: boolean;
  messages: ChatMessage[];
  conversationId: string | null;
  visitorId: string | null;
  connectionStatus: "disconnected" | "connecting" | "connected";
  connectionError: ConnectionError;
  conversationStatus: ConversationStatus | null;
  typingUser: TypingUser;
};

const listeners: Map<keyof State, Set<Listener<unknown>>> = new Map();

let state: State = {
  settings: {} as WidgetSettings,
  isOpen: false,
  messages: [],
  conversationId: null,
  visitorId: null,
  connectionStatus: "disconnected",
  connectionError: null,
  conversationStatus: null,
  typingUser: null,
};

export function getState<K extends keyof State>(key: K): State[K] {
  return state[key];
}

export function setState<K extends keyof State>(
  key: K,
  value: State[K] | ((prev: State[K]) => State[K])
): void {
  const next = typeof value === "function" ? (value as (p: State[K]) => State[K])(state[key]) : value;
  if (state[key] === next) return;
  state = { ...state, [key]: next };
  listeners.get(key)?.forEach((fn) => fn(next));
}

export function subscribe<K extends keyof State>(
  key: K,
  listener: Listener<State[K]>
): () => void {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key)!.add(listener as Listener<unknown>);
  return () => listeners.get(key)?.delete(listener as Listener<unknown>);
}
