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
  kind: "production" | "test";
  port: number | null;
  aiInterviewStatus: AiInterviewStatus;
  // Only populated on the detail endpoint (GET /applications/:id); the list
  // endpoint's projection does not include these columns.
  aiAutoRespond?: boolean;
  aiDbEnabled?: boolean;
};

export type CreateApplicationRequest =
  | {
      kind?: "production";
      name: string;
      domain: string;
      description?: string;
      settings?: Record<string, unknown>;
    }
  | {
      kind: "test";
      name: string;
      port: number;
      description?: string;
      settings?: Record<string, unknown>;
    };

export type UpdateApplicationRequest = {
  name?: string;
  description?: string;
  settings?: Record<string, unknown>;
  allowedOrigins?: string[];
  aiAutoRespond?: boolean;
  aiDbEnabled?: boolean;
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
