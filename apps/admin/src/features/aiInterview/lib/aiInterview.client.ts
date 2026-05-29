import { getApiBaseUrl } from "@/lib/urls";
import { getTenantHeaders } from "@/lib/tenantHeaders";
import type {
  InterviewCompleteResponse,
  InterviewGenerateSummaryResponse,
  InterviewState,
  InterviewTurnResponse,
} from "../types/aiInterview.types";

const base = () => getApiBaseUrl();

export class InterviewTurnConflictError extends Error {
  readonly code = "turn_conflict" as const;
  constructor(
    readonly currentTurn: number,
    readonly status: "in_progress" | "completed",
  ) {
    super(`turn_conflict: current=${currentTurn} status=${status}`);
    this.name = "InterviewTurnConflictError";
  }
}

export class InterviewClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly missing?: string[];

  constructor(args: {
    code: string;
    status: number;
    message: string;
    missing?: string[];
  }) {
    super(args.message);
    this.name = "InterviewClientError";
    this.code = args.code;
    this.status = args.status;
    this.missing = args.missing;
  }
}

async function parseError(res: Response): Promise<Error> {
  const body = (await res.json().catch(() => null)) as {
    error?: string;
    message?: string;
    currentTurn?: number;
    status?: "in_progress" | "completed";
    missing?: string[];
  } | null;

  if (res.status === 409 && body?.error === "turn_conflict") {
    return new InterviewTurnConflictError(
      typeof body.currentTurn === "number" ? body.currentTurn : 0,
      body.status ?? "in_progress",
    );
  }

  const code = body?.error ?? "unknown_error";
  const message =
    body?.message ?? body?.error ?? `Request failed (${res.status})`;
  return new InterviewClientError({
    code,
    status: res.status,
    message,
    missing: Array.isArray(body?.missing) ? body.missing : undefined,
  });
}

export async function getInterviewState(
  applicationId: string,
): Promise<InterviewState> {
  const res = await fetch(
    `${base()}/applications/${applicationId}/ai-interview`,
    {
      headers: getTenantHeaders({ json: true }),
    },
  );
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as InterviewState;
}

export async function postInterviewTurn(
  applicationId: string,
  body: { message: string; expectedCurrentTurn: number },
): Promise<InterviewTurnResponse> {
  const res = await fetch(
    `${base()}/applications/${applicationId}/ai-interview/turns`,
    {
      method: "POST",
      headers: getTenantHeaders({ json: true }),
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as InterviewTurnResponse;
}

export async function postInterviewComplete(
  applicationId: string,
  body: { expectedCurrentTurn: number },
): Promise<InterviewCompleteResponse> {
  const res = await fetch(
    `${base()}/applications/${applicationId}/ai-interview/complete`,
    {
      method: "POST",
      headers: getTenantHeaders({ json: true }),
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as InterviewCompleteResponse;
}

export async function postInterviewGenerateSummary(
  applicationId: string,
): Promise<InterviewGenerateSummaryResponse> {
  const res = await fetch(
    `${base()}/applications/${applicationId}/ai-interview/generate-summary`,
    {
      method: "POST",
      headers: getTenantHeaders({ json: true }),
    },
  );
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as InterviewGenerateSummaryResponse;
}
