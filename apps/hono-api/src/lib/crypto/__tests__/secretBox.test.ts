import { describe, it, expect, beforeEach, vi } from "vitest";

// Two distinct, deterministic 32-byte base64 keys for testing.
const KEY_A = Buffer.alloc(32, 1).toString("base64");
const KEY_B = Buffer.alloc(32, 2).toString("base64");

// Mutable mock env so we can swap the master key between calls (lazy parsing).
const mockEnv = { SECRETS_ENCRYPTION_KEY: KEY_A };

vi.mock("../../../env.js", () => ({
  env: mockEnv,
}));

const { encryptSecret, decryptSecret, EncryptionError, DecryptionError } =
  await import("../secretBox.js");

describe("secretBox", () => {
  beforeEach(() => {
    mockEnv.SECRETS_ENCRYPTION_KEY = KEY_A;
  });

  it("round-trips a plaintext secret", () => {
    const plaintext = "sk_live_super_secret_api_key";
    const ciphertext = encryptSecret(plaintext);
    expect(decryptSecret(ciphertext)).toBe(plaintext);
  });

  it("round-trips an empty string", () => {
    const ciphertext = encryptSecret("");
    expect(decryptSecret(ciphertext)).toBe("");
  });

  it("produces the versioned v1 format", () => {
    const ciphertext = encryptSecret("hello");
    const parts = ciphertext.split(":");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe("v1");
  });

  it("uses a unique IV per call (same plaintext encrypts differently)", () => {
    const plaintext = "same-secret";
    const a = encryptSecret(plaintext);
    const b = encryptSecret(plaintext);
    expect(a).not.toBe(b);
    // Both still decrypt back to the same plaintext.
    expect(decryptSecret(a)).toBe(plaintext);
    expect(decryptSecret(b)).toBe(plaintext);
  });

  it("throws DecryptionError when the ciphertext data is tampered with", () => {
    const ciphertext = encryptSecret("tamper-me");
    const [version, iv, tag, data] = ciphertext.split(":") as [
      string,
      string,
      string,
      string,
    ];
    // Flip the first byte of the encrypted data.
    const dataBytes = Buffer.from(data, "base64");
    dataBytes[0] = dataBytes[0]! ^ 0xff;
    const tampered = [version, iv, tag, dataBytes.toString("base64")].join(":");
    expect(() => decryptSecret(tampered)).toThrow(DecryptionError);
  });

  it("throws DecryptionError when the auth tag is tampered with", () => {
    const ciphertext = encryptSecret("tamper-tag");
    const [version, iv, tag, data] = ciphertext.split(":") as [
      string,
      string,
      string,
      string,
    ];
    const tagBytes = Buffer.from(tag, "base64");
    tagBytes[0] = tagBytes[0]! ^ 0xff;
    const tampered = [version, iv, tagBytes.toString("base64"), data].join(":");
    expect(() => decryptSecret(tampered)).toThrow(DecryptionError);
  });

  it("throws DecryptionError when decrypted with the wrong key", () => {
    const ciphertext = encryptSecret("secret-under-key-a");
    // Swap the master key before decrypting.
    mockEnv.SECRETS_ENCRYPTION_KEY = KEY_B;
    expect(() => decryptSecret(ciphertext)).toThrow(DecryptionError);
  });

  it("throws DecryptionError on an unknown version prefix", () => {
    const ciphertext = encryptSecret("versioned");
    const withUnknownVersion = ciphertext.replace(/^v1:/, "v2:");
    expect(() => decryptSecret(withUnknownVersion)).toThrow(DecryptionError);
  });

  it("throws DecryptionError on a malformed ciphertext", () => {
    expect(() => decryptSecret("not-a-valid-ciphertext")).toThrow(
      DecryptionError,
    );
    expect(() => decryptSecret("v1:only:three")).toThrow(DecryptionError);
    expect(() => decryptSecret("")).toThrow(DecryptionError);
  });

  it("throws EncryptionError when the master key is not 32 bytes", () => {
    mockEnv.SECRETS_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString("base64");
    expect(() => encryptSecret("boom")).toThrow(EncryptionError);
  });
});
