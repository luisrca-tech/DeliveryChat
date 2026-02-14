const STORAGE_KEY = "bearer_token";

function isBrowser() {
  return typeof window !== "undefined";
}

export function getBearerToken(): string | null {
  if (!isBrowser()) return null;
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setBearerToken(token: string): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, token);
  } catch {
    // ignore storage errors
  }
}

export function clearBearerToken(): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

