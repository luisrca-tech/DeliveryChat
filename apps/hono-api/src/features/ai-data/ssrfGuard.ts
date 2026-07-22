/**
 * SSRF egress guardrails for HTTP DataTools.
 *
 * Rejects any address that resolves into a private, loopback, link-local or
 * otherwise reserved range — including IPv4-mapped IPv6 forms — so a tool can
 * never be pointed at internal infrastructure via DNS rebinding.
 */

export function isPrivateAddress(address: string, family: number): boolean {
  if (family === 4) {
    return isPrivateIPv4(address);
  }
  if (family === 6) {
    return isPrivateIPv6(address);
  }
  // Unknown family — fail closed.
  return true;
}

function isPrivateIPv4(address: string): boolean {
  const octets = address.split(".").map((part) => Number(part));
  if (
    octets.length !== 4 ||
    octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
  ) {
    // Unparseable — fail closed.
    return true;
  }
  const [a, b] = octets as [number, number, number, number];

  // 0.0.0.0/8 (includes 0.0.0.0)
  if (a === 0) return true;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 127.0.0.0/8 loopback
  if (a === 127) return true;
  // 169.254.0.0/16 link-local
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;

  return false;
}

function isPrivateIPv6(address: string): boolean {
  const addr = address.toLowerCase().split("%")[0] ?? "";

  // Loopback ::1 and unspecified ::
  if (addr === "::1" || addr === "::") return true;

  // IPv4-mapped (::ffff:a.b.c.d) or IPv4-compatible — validate the embedded v4.
  const mapped = addr.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) {
    return isPrivateIPv4(mapped[1]);
  }

  const firstHextet = parseInt(addr.split(":")[0] || "0", 16);
  // fc00::/7 unique-local (fc00–fdff)
  if (firstHextet >= 0xfc00 && firstHextet <= 0xfdff) return true;
  // fe80::/10 link-local (fe80–febf)
  if (firstHextet >= 0xfe80 && firstHextet <= 0xfebf) return true;

  return false;
}
