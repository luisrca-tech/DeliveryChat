export type Application = {
  id: string;
  name: string;
  domain: string;
  description: string | null;
  organizationId: string;
  settings: Record<string, unknown>;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateApplicationRequest = {
  name: string;
  domain: string;
  description?: string;
  settings?: Record<string, unknown>;
};

export type UpdateApplicationRequest = {
  name?: string;
  description?: string;
  settings?: Record<string, unknown>;
};

export type ApplicationsListResponse = {
  applications: Application[];
  limit: number;
  offset: number;
};

export type ApplicationDetailResponse = {
  application: Application;
  activeApiKeysCount: number;
};
