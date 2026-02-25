/**
 * RFC-style domain validation: labels start/end alphanumeric, no consecutive dots,
 * hyphens only in the middle, max 63 chars per label.
 */
export const DOMAIN_REGEX =
  /^(\*\.)?[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;
