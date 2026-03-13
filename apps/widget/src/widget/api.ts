export async function fetchSettings(
  apiBaseUrl: string,
  appId: string
): Promise<Record<string, unknown> | null> {
  const url = `${apiBaseUrl.replace(/\/$/, "")}/v1/widget/settings/${appId}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as { settings?: Record<string, unknown> };
  return data.settings ?? null;
}
