export type DataSourceKind = "http" | "sql";

/** Secret-free view of a DataSource, as returned by GET /:applicationId/data-source. */
export type RedactedDataSource =
  | {
      kind: "http";
      enabled: boolean;
      baseUrl: string;
      allowedHost: string;
      hasHeaders: boolean;
      headerNames: string[];
      createdAt: string;
      updatedAt: string;
    }
  | {
      kind: "sql";
      enabled: boolean;
      hasConnectionString: boolean;
      createdAt: string;
      updatedAt: string;
    };

/** PUT /:applicationId/data-source body. Secrets are write-only and optional on update. */
export type DataSourceBody =
  | {
      kind: "http";
      baseUrl: string;
      allowedHost: string;
      headers?: Record<string, string>;
    }
  | {
      kind: "sql";
      connectionString?: string;
    };

export type ToolPropertyType = "string" | "number" | "integer" | "boolean";

export type ToolInputSchema = {
  type?: "object";
  properties: Record<string, { type: ToolPropertyType }>;
  required?: string[];
};

export type HttpToolConfig = { method: "GET"; urlTemplate: string };
export type SqlToolConfig = { query: string };

type DataToolBase = {
  id: string;
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  enabled: boolean;
  lastTestedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Discriminated on `backingType` so `config` narrows without a cast. */
export type DataTool =
  | (DataToolBase & { backingType: "http"; config: HttpToolConfig })
  | (DataToolBase & { backingType: "sql"; config: SqlToolConfig });

/** POST/PUT /:applicationId/data-tools(/:toolId) body — discriminated on backingType. */
export type DataToolBody =
  | {
      name: string;
      description: string;
      inputSchema: ToolInputSchema;
      backingType: "http";
      config: HttpToolConfig;
    }
  | {
      name: string;
      description: string;
      inputSchema: ToolInputSchema;
      backingType: "sql";
      config: SqlToolConfig;
    };

export type TestDataToolResult =
  | { ok: true; data: unknown; truncated: false }
  | { ok: true; dataPreview: string; truncated: true }
  | { ok: false; error: string; kind: "validation" | "execution" | "timeout" };
