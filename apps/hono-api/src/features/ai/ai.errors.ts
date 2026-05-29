import type {
  CoreTopic,
  InterviewContextRow,
} from "./ai.interview.schema.js";

export class AIProviderError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AIProviderError";
  }
}

export class AIProviderRateLimitError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AIProviderRateLimitError";
  }
}

export class AITimeoutError extends AIProviderError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AITimeoutError";
  }
}

export class AIEmptyResponseError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AIEmptyResponseError";
  }
}

export class AIContentFilteredError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AIContentFilteredError";
  }
}

export class AIConversationNotFoundError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AIConversationNotFoundError";
  }
}

export class AIApplicationRequiredError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AIApplicationRequiredError";
  }
}

export class AINotConfiguredError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AINotConfiguredError";
  }
}

// Mapper fallback — primary enforcement is in the rate-limit middleware
export class AIQuotaExceededError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AIQuotaExceededError";
  }
}

export class MissingTopicsError extends Error {
  readonly missing: CoreTopic[];
  readonly code = "interview_checklist_incomplete";

  constructor(missing: CoreTopic[]) {
    super(`interview_checklist_incomplete: missing=${missing.join(",")}`);
    this.name = "MissingTopicsError";
    this.missing = missing;
  }
}

export class TurnConflictError extends Error {
  readonly currentTurn: number;
  readonly status: InterviewContextRow["status"] | "not_started";

  constructor(
    currentTurn: number,
    status: InterviewContextRow["status"] | "not_started",
  ) {
    super(`turn_conflict: current=${currentTurn} status=${status}`);
    this.name = "TurnConflictError";
    this.currentTurn = currentTurn;
    this.status = status;
  }
}
