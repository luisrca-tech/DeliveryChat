export function isValidLogoUrl(url: string | undefined): boolean {
  if (!url || typeof url !== "string" || url.trim() === "") {
    return false;
  }
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function isValidLauncherImageUrl(url: string | undefined): boolean {
  if (!url || typeof url !== "string" || url.trim() === "") {
    return false;
  }
  const raw = url.trim();
  const baseForRelative =
    typeof window !== "undefined" && typeof window.location?.href === "string"
      ? window.location.href
      : "https://deliverychat.invalid/";
  try {
    const parsed =
      raw.startsWith("http://") || raw.startsWith("https://")
        ? new URL(raw)
        : new URL(raw, baseForRelative);
    if (parsed.protocol === "https:") return true;
    if (parsed.protocol === "http:") {
      const h = parsed.hostname;
      return (
        h === "localhost" ||
        h === "127.0.0.1" ||
        h.endsWith(".localhost")
      );
    }
    return false;
  } catch {
    return false;
  }
}
