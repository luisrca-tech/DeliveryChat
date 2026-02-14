const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function daysUntil(isoDate: string, now: Date): number | null {
  const target = new Date(isoDate);
  if (Number.isNaN(target.getTime())) return null;
  return Math.ceil((target.getTime() - now.getTime()) / MS_PER_DAY);
}
