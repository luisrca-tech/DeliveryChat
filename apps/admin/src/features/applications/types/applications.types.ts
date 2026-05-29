import type { AiInterviewStatus } from "@/features/aiInterview/types/aiInterview.types";

export type Application = {
  id: string;
  name: string;
  domain: string;
  allowedOrigins: string[];
  description: string | null;
  organizationId: string;
  settings: Record<string, unknown>;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  aiInterviewStatus: AiInterviewStatus;
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
  allowedOrigins?: string[];
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
