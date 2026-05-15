import { createHmac, timingSafeEqual } from "node:crypto";

export function computeHmac(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}

export function verifyHmac(
  secret: string,
  data: string,
  providedHmac: string,
): boolean {
  if (!providedHmac) return false;
  const expected = computeHmac(secret, data);
  if (expected.length !== providedHmac.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(providedHmac));
}
