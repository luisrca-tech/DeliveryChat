import { InfisicalSDK } from "@infisical/sdk";

/**
 * Minimal helper to fetch secrets from Infisical at runtime using the SDK.
 *
 * For most use cases, prefer using `infisical run` CLI which injects secrets
 * into process.env automatically. Use this helper only when you need runtime
 * secret fetching (e.g., serverless, dynamic environments).
 *
 * @param path - The secret path/folder in Infisical (e.g., "/hono-api")
 * @param environment - The environment to fetch secrets from: "dev", "staging", or "prod" (defaults to mapping from NODE_ENV)
 * @returns Object with secrets as key-value pairs
 *
 * @example
 * ```typescript
 * const secrets = await getSecrets("/hono-api", "prod");
 * const dbUrl = secrets.DATABASE_URL;
 * ```
 */
export async function getSecrets<T extends Record<string, string>>(
  path: string,
  environment: "dev" | "staging" | "prod" = (() => {
    const nodeEnv = process.env.NODE_ENV || "development";
    // Map NODE_ENV to Infisical environment names
    if (nodeEnv === "production") return "prod";
    if (nodeEnv === "staging") return "staging";
    return "dev"; // default to dev
  })()
): Promise<T> {
  const projectId = process.env.INFISICAL_PROJECT_ID;
  if (!projectId) {
    throw new Error(
      "INFISICAL_PROJECT_ID must be set. Use 'infisical run' CLI for local development."
    );
  }

  const sdk = new InfisicalSDK({
    siteUrl: process.env.INFISICAL_URL || "https://app.infisical.com",
  });

  const response = await sdk.secrets().listSecrets({
    secretPath: path,
    environment,
    projectId,
    viewSecretValue: true,
  });

  const secretsObj: Record<string, string> = {};
  for (const secret of response.secrets) {
    if (secret.secretKey && secret.secretValue) {
      secretsObj[secret.secretKey] = secret.secretValue;
    }
  }

  return secretsObj as T;
}
