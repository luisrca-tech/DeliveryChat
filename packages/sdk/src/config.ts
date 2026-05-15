const envBase =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

let runtimeBaseUrl: string | null = null;

export function setApiBaseUrl(url: string): void {
  runtimeBaseUrl = url.replace(/\/$/, "");
}

function detectBaseUrlFromScript(): string {
  if (typeof document === "undefined") return "";
  const scripts = document.querySelectorAll("script[src]");
  for (let i = scripts.length - 1; i >= 0; i--) {
    const src = scripts[i]?.getAttribute("src") ?? "";
    if (src.includes("widget") && src.endsWith(".js")) {
      try {
        const url = new URL(src, window.location.origin);
        return url.origin;
      } catch {
        // Ignore invalid URLs
      }
    }
  }
  return "";
}

export function getApiBaseUrl(): string {
  if (runtimeBaseUrl) return runtimeBaseUrl;
  if (envBase) return envBase.replace(/\/$/, "");
  const detected = detectBaseUrlFromScript();
  if (detected) return detected;
  if (typeof window !== "undefined") {
    return window.location.origin.replace(/\/$/, "");
  }
  return "";
}
