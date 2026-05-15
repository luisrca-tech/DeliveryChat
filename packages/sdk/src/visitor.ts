const STORAGE_KEY = "dc_visitor_id";

export function getOrCreateVisitorId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
  } catch {
    // localStorage not available
  }

  const id = crypto.randomUUID();

  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // localStorage not available — use ephemeral ID
  }

  return id;
}

export function getVisitorId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
