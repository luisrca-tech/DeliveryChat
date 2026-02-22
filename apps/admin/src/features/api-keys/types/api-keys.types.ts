export type ApiKeyEnvironment = "live" | "test";

export type ApiKeyListItem = {
  id: string;
  keyPrefix: string;
  name: string | null;
  environment: ApiKeyEnvironment;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export type ApiKeysListResponse = {
  apiKeys: ApiKeyListItem[];
  limit: number;
  used: number;
};

export type CreateApiKeyRequest = {
  name?: string;
  environment?: ApiKeyEnvironment;
  expiresAt?: string;
};

export type RegenerateApiKeyRequest = {
  name?: string;
  expiresAt?: string;
};

export type ApiKeyCreatedResponse = {
  id: string;
  appId: string;
  key: string;
  keyPrefix: string;
  name: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export type Application = {
  id: string;
  name: string;
  domain: string;
  description: string | null;
  organizationId: string;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ApplicationsListResponse = {
  applications: Application[];
  limit: number;
  offset: number;
};
