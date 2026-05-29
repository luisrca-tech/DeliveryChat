export type RateLimitWindowConfig = {
  windowMs: number;
  maxRequests: number;
};

type WindowState = {
  count: number;
  resetAt: number;
};

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export interface RateLimitStore {
  check(key: string): RateLimitResult;
  increment(key: string): void;
}

export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly store = new Map<string, WindowState[]>();
  private readonly windows: RateLimitWindowConfig[];

  constructor(windows: RateLimitWindowConfig[]) {
    this.windows = windows;
  }

  private getOrCreate(key: string): WindowState[] {
    const now = Date.now();

    if (!this.store.has(key)) {
      this.store.set(
        key,
        this.windows.map((w) => ({ count: 0, resetAt: now + w.windowMs })),
      );
    }

    return this.store.get(key)!;
  }

  private refreshExpired(states: WindowState[], key: string): boolean {
    const now = Date.now();
    let allExpired = true;

    for (let i = 0; i < states.length; i++) {
      const state = states[i]!;
      const config = this.windows[i]!;

      if (now >= state.resetAt) {
        state.count = 0;
        state.resetAt = now + config.windowMs;
      } else {
        allExpired = false;
      }
    }

    if (allExpired) {
      this.store.delete(key);
      this.store.set(
        key,
        this.windows.map((w) => ({ count: 0, resetAt: now + w.windowMs })),
      );
    }

    return allExpired;
  }

  check(key: string): RateLimitResult {
    const states = this.getOrCreate(key);
    this.refreshExpired(states, key);

    const currentStates = this.store.get(key)!;
    const now = Date.now();

    for (let i = 0; i < currentStates.length; i++) {
      const state = currentStates[i]!;
      const config = this.windows[i]!;

      if (state.count >= config.maxRequests) {
        const retryAfterSeconds = Math.ceil((state.resetAt - now) / 1000);
        return { allowed: false, retryAfterSeconds };
      }
    }

    return { allowed: true };
  }

  increment(key: string): void {
    const states = this.getOrCreate(key);
    this.refreshExpired(states, key);

    const currentStates = this.store.get(key)!;
    for (const state of currentStates) {
      state.count++;
    }
  }
}
