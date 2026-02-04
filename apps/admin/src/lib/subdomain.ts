export function getSubdomain(hostname?: string): string | null {
  const resolved =
    hostname ??
    (typeof window !== "undefined" ? window.location.hostname : null);

  if (!resolved) return null;

  const h = resolved.toLowerCase();

  if (h === "localhost" || h === "127.0.0.1") return null;

  if (h.endsWith(".localhost")) {
    return h.replace(".localhost", "") || null;
  }

  if (h.endsWith(".vercel.app")) {
    const firstLabel = h.split(".")[0] || "";
    return firstLabel.split("---")[0] || null;
  }

  const labels = h.split(".").filter(Boolean);
  if (labels.length <= 2) return null;

  const first = labels[0] ?? "";
  if (!first) return null;
  if (first === "api" || first === "api-dev" || first === "www") return null;

  return first;
}
