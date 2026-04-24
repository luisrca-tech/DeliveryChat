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

export async function fetchWsToken(
  apiBaseUrl: string,
  appId: string,
  visitorId: string,
): Promise<string> {
  const url = `${apiBaseUrl.replace(/\/$/, "")}/v1/widget/ws-token`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-App-Id": appId,
      "X-Visitor-Id": visitorId,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch WS token (${res.status})`);
  }

  const data = (await res.json()) as { token: string };
  return data.token;
}
