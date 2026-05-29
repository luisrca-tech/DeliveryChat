import { getApiBaseUrl } from "@/lib/urls";
import { getTenantHeaders } from "@/lib/tenantHeaders";
import type {
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

async function parseError(res: Response): Promise<Error> {
  const body = (await res.json().catch(() => null)) as {
    error?: string;
    message?: string;
    currentTurn?: number;
    status?: "in_progress" | "completed";
  } | null;

  if (res.status === 409 && body?.error === "turn_conflict") {
    return new InterviewTurnConflictError(
      typeof body.currentTurn === "number" ? body.currentTurn : 0,
      body.status ?? "in_progress",
    );
  }

  const message =
    body?.message ?? body?.error ?? `Request failed (${res.status})`;
  return new Error(message);
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
