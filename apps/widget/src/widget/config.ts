const envBase =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

export function getApiBaseUrl(): string {
  if (envBase) return envBase.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    return window.location.origin.replace(/\/$/, "");
  }
  return "";
}
