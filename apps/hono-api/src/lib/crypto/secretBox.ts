import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  type CipherGCM,
  type DecipherGCM,
} from "node:crypto";
import { env } from "../../env.js";

/**
 * App-level encryption helper for customer DataSource secrets (API keys, DB
 * connection strings) stored at rest.
 *
 * Algorithm: AES-256-GCM with a random 12-byte IV and authentication tag.
 * Ciphertext format: `v1:<iv-base64>:<tag-base64>:<data-base64>`.
 *
 * The `v1` key-version prefix enables future key rotation: a new version can be
 * introduced while `decryptSecret` still recognizes older prefixes.
 */

const KEY_VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;

export class EncryptionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "EncryptionError";
  }
}

export class DecryptionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DecryptionError";
  }
}

/**
 * Parse the base64 master key from the environment. Decoded lazily on each call
 * so tests that mock `env` (and key rotation) behave correctly.
 */
function getMasterKey(): Buffer {
  const key = Buffer.from(env.SECRETS_ENCRYPTION_KEY, "base64");
  if (key.length !== KEY_BYTES) {
    throw new EncryptionError(
      `SECRETS_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes, got ${key.length}`,
    );
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const key = getMasterKey();
  try {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv) as CipherGCM;
    const data = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return [
      KEY_VERSION,
      iv.toString("base64"),
      tag.toString("base64"),
      data.toString("base64"),
    ].join(":");
  } catch (error) {
    if (error instanceof EncryptionError) throw error;
    throw new EncryptionError("Failed to encrypt secret", { cause: error });
  }
}

export function decryptSecret(ciphertext: string): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 4) {
    throw new DecryptionError(
      `Malformed ciphertext: expected 4 segments, got ${parts.length}`,
    );
  }

  const [version, ivB64, tagB64, dataB64] = parts;
  if (
    version === undefined ||
    ivB64 === undefined ||
    tagB64 === undefined ||
    dataB64 === undefined
  ) {
    throw new DecryptionError("Malformed ciphertext: missing segment");
  }
  if (version !== KEY_VERSION) {
    throw new DecryptionError(`Unsupported key version: ${version}`);
  }

  const key = getMasterKey();
  try {
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const data = Buffer.from(dataB64, "base64");

    const decipher = createDecipheriv(ALGORITHM, key, iv) as DecipherGCM;
    decipher.setAuthTag(tag);

    const plaintext = Buffer.concat([
      decipher.update(data),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  } catch (error) {
    if (error instanceof DecryptionError) throw error;
    throw new DecryptionError(
      "Failed to decrypt secret (tampered ciphertext or wrong key)",
      { cause: error },
    );
  }
}
