const COOLDOWN_MS = 60_000;
const MAX_PER_HOUR = 5;
const MAX_PER_DAY = 10;

type Entry = {
  timestamps: number[];
};

const store = new Map<string, Entry>();

function prune(entry: Entry, now: number): void {
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  entry.timestamps = entry.timestamps.filter((t) => t > oneDayAgo);
}

export function checkResendOtpRateLimit(email: string): {
  allowed: boolean;
  retryAfterSeconds?: number;
} {
  const now = Date.now();
  const key = `resend-otp:${email.toLowerCase().trim()}`;
  let entry = store.get(key);

  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  prune(entry, now);

  const oneMinuteAgo = now - COOLDOWN_MS;
  const oneHourAgo = now - 60 * 60 * 1000;
  const oneDayAgo = now - 24 * 60 * 60 * 1000;

  const lastMinute = entry.timestamps.filter((t) => t > oneMinuteAgo).length;
  const lastHour = entry.timestamps.filter((t) => t > oneHourAgo).length;
  const lastDay = entry.timestamps.filter((t) => t > oneDayAgo).length;

  if (lastMinute >= 1) {
    const oldestInMinute = entry.timestamps.find((t) => t > oneMinuteAgo);
    const retryAfter = oldestInMinute
      ? Math.ceil((oldestInMinute + COOLDOWN_MS - now) / 1000)
      : 60;
    return { allowed: false, retryAfterSeconds: Math.max(1, retryAfter) };
  }
  if (lastHour >= MAX_PER_HOUR) {
    return { allowed: false, retryAfterSeconds: 60 };
  }
  if (lastDay >= MAX_PER_DAY) {
    return { allowed: false, retryAfterSeconds: 3600 };
  }

  entry.timestamps.push(now);
  return { allowed: true };
}
