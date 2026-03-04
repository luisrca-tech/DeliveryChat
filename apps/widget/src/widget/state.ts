import type { WidgetSettings } from "./types.js";

type Listener<T> = (value: T) => void;

type State = {
  settings: WidgetSettings;
  isOpen: boolean;
  messages: Array<{ id: string; text: string; role: "user" | "visitor" }>;
};

const listeners: Map<keyof State, Set<Listener<unknown>>> = new Map();

let state: State = {
  settings: {} as WidgetSettings,
  isOpen: false,
  messages: [],
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
