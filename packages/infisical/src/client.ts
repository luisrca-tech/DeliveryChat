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
  })(),
): Promise<T> {
  const projectId = process.env.INFISICAL_PROJECT_ID;
  if (!projectId) {
    throw new Error(
      "INFISICAL_PROJECT_ID must be set. Use 'infisical run' CLI for local development.",
    );
  }

  // Authenticate using Service Token (preferred) or Universal Auth
  const serviceToken = process.env.INFISICAL_TOKEN;
  const clientId = process.env.INFISICAL_CLIENT_ID;
  const clientSecret = process.env.INFISICAL_CLIENT_SECRET;

  if (!serviceToken && (!clientId || !clientSecret)) {
    throw new Error(
      "Authentication required. Set either INFISICAL_TOKEN (recommended) or INFISICAL_CLIENT_ID + INFISICAL_CLIENT_SECRET. " +
        "For Service Token: Go to Project Settings > Service Tokens in Infisical dashboard. " +
        "For Universal Auth: Create a Machine Identity in Organization Settings > Identities. " +
        "Use 'infisical run' CLI for local development.",
    );
  }

  // Initialize SDK
  const sdk = new InfisicalSDK({
    siteUrl: process.env.INFISICAL_URL || "https://app.infisical.com",
  });

  // Authenticate using Service Token (preferred) or Universal Auth
  if (serviceToken) {
    // In Infisical SDK v4.0, service tokens are set via the auth().accessToken() method
    sdk.auth().accessToken(serviceToken);
  } else if (clientId && clientSecret) {
    await sdk.auth().universalAuth.login({
      clientId,
      clientSecret,
    });
  }

  const response = await sdk.secrets().listSecrets({
    secretPath: path,
    environment,
    projectId,
    expandSecretReferences: true,
  });

  const secretsObj: Record<string, string> = {};
  for (const secret of response.secrets) {
    if (secret.secretKey && secret.secretValue) {
      secretsObj[secret.secretKey] = secret.secretValue;
    }
  }

  return secretsObj as T;
}
