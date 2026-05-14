export const VISITOR_ID_KEY = "dc_visitor_id";

export function resolveVisitorId(): string {
  const stored = localStorage.getItem(VISITOR_ID_KEY);
  if (stored) return stored;
  const id = crypto.randomUUID();
  localStorage.setItem(VISITOR_ID_KEY, id);
  return id;
}
