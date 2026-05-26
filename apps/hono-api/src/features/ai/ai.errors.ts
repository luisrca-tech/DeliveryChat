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

export class AIQuotaExceededError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AIQuotaExceededError";
  }
}
