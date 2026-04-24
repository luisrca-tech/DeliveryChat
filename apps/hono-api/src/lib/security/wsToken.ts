import { createHmac, timingSafeEqual } from "crypto";

const DEFAULT_TTL_SECONDS = 120;

export type WsTokenPayload = {
  appId: string;
  origin: string;
  visitorId: string;
  iat: number;
  exp: number;
};

type SignOptions = {
  ttlSeconds?: number;
};

type VerifyOptions = {
  expectedOrigin?: string;
};

type VerifyResult =
  | { valid: true; payload: WsTokenPayload }
  | { valid: false; error: "malformed_token" | "invalid_signature" | "token_expired" | "origin_mismatch" };

export function signWsToken(
  data: { appId: string; origin: string; visitorId: string },
  secret: string,
  options?: SignOptions,
): string {
  const ttl = options?.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const now = Math.floor(Date.now() / 1000);

  const payload: WsTokenPayload = {
    appId: data.appId,
    origin: data.origin,
    visitorId: data.visitorId,
    iat: now,
    exp: now + ttl,
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = computeHmac(encodedPayload, secret);

  return `${encodedPayload}.${signature}`;
}

export function verifyWsToken(
  token: string,
  secret: string,
  options?: VerifyOptions,
): VerifyResult {
  if (!token) {
    return { valid: false, error: "malformed_token" };
  }

  const dotIndex = token.indexOf(".");
  if (dotIndex === -1 || dotIndex === 0 || dotIndex === token.length - 1) {
    return { valid: false, error: "malformed_token" };
  }

  const encodedPayload = token.slice(0, dotIndex);
  const providedSignature = token.slice(dotIndex + 1);

  const expectedSignature = computeHmac(encodedPayload, secret);

  const sigBuffer = Buffer.from(providedSignature, "base64url");
  const expectedBuffer = Buffer.from(expectedSignature, "base64url");

  if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
    return { valid: false, error: "invalid_signature" };
  }

  let payload: WsTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString());
  } catch {
    return { valid: false, error: "malformed_token" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) {
    return { valid: false, error: "token_expired" };
  }

  if (options?.expectedOrigin && payload.origin !== options.expectedOrigin) {
    return { valid: false, error: "origin_mismatch" };
  }

  return { valid: true, payload };
}

function computeHmac(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}
