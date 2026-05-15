type Listener<T> = (payload: T) => void;

export class EventEmitter<EventMap extends Record<string, unknown>> {
  private listeners = new Map<keyof EventMap, Set<Listener<never>>>();

  on<K extends keyof EventMap>(event: K, callback: Listener<EventMap[K]>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback as Listener<never>);
  }

  off<K extends keyof EventMap>(event: K, callback: Listener<EventMap[K]>): void {
    this.listeners.get(event)?.delete(callback as Listener<never>);
  }

  emit<K extends keyof EventMap>(
    ...args: EventMap[K] extends void ? [event: K] | [event: K, payload?: undefined] : [event: K, payload: EventMap[K]]
  ): void {
    const [event, payload] = args;
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      try {
        (fn as Listener<EventMap[K]>)(payload as EventMap[K]);
      } catch (err) {
        console.error(`[DeliveryChat] Event listener error for "${String(event)}":`, err);
      }
    }
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}
