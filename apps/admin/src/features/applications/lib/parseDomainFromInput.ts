export function parseDomainFromInput(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(
      trimmed.startsWith("http://") || trimmed.startsWith("https://")
        ? trimmed
        : `https://${trimmed}`,
    );
    return url.hostname.toLowerCase();
  } catch {
    return trimmed.toLowerCase();
  }
}
