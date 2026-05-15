export async function fetchSettings(
  apiBaseUrl: string,
  appId: string
): Promise<Record<string, unknown> | null> {
  const url = `${apiBaseUrl.replace(/\/$/, "")}/api/v1/widget/settings/${appId}`;
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
  const url = `${apiBaseUrl.replace(/\/$/, "")}/api/v1/widget/ws-token`;
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

export type IdentifyPayload = {
  name?: string;
  email?: string;
  externalId?: string;
  metadata?: Record<string, unknown>;
  hmac?: string;
};

export type IdentityRecord = {
  id: string;
  anonymousUserId: string;
  organizationId: string;
  externalId?: string | null;
  email?: string | null;
  name?: string | null;
  metadata?: Record<string, unknown> | null;
  hmacVerified: boolean;
};

export async function postIdentify(
  apiBaseUrl: string,
  appId: string,
  visitorId: string,
  payload: IdentifyPayload,
): Promise<IdentityRecord> {
  const url = `${apiBaseUrl.replace(/\/$/, "")}/api/v1/widget/identify`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-App-Id": appId,
      "X-Visitor-Id": visitorId,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = (body as Record<string, unknown>).message ?? res.statusText;
    throw new Error(`identify failed (${res.status}): ${msg}`);
  }

  const data = (await res.json()) as { identity: IdentityRecord };
  return data.identity;
}
