function normalizeIsoInstant(input: string): string {
  const s = input.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00Z`;

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(s)) {
    return `${s.replace(" ", "T")}Z`;
  }

  const hasTimezone = /([zZ]|[+-]\d{2}:\d{2})$/.test(s);
  if (s.includes("T") && !hasTimezone) return `${s}Z`;

  return s;
}

export function daysUntil(iso: string): number {
  const normalized = normalizeIsoInstant(iso);
  const targetMs = new Date(normalized).getTime();
  if (!Number.isFinite(targetMs)) return 0;

  const ms = targetMs - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}
