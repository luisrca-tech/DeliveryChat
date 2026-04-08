const envBase =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

let runtimeBaseUrl: string | null = null;

export function setApiBaseUrl(url: string): void {
  runtimeBaseUrl = url.replace(/\/$/, "");
}

export function getApiBaseUrl(): string {
  if (runtimeBaseUrl) return runtimeBaseUrl;
  if (envBase) return envBase.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    return window.location.origin.replace(/\/$/, "");
  }
  return "";
}
