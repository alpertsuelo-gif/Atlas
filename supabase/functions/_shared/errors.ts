// =============================================================================
// Atlas — Custom Error Classes
// =============================================================================
// Every error that surfaces to the frontend goes through these classes.
// The Edge Function handler pattern in §11 of the architecture maps each class
// to the correct HTTP status code and user-facing message.

/**
 * Base error for all Atlas-specific failures.
 * Never instantiated directly — use one of the subclasses below.
 */
export class AtlasError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AtlasError";
  }
}

/**
 * The AI provider returned an error (rate limit, auth failure, timeout, etc.).
 * Mapped to HTTP 502 in Edge Functions — the service is temporarily unavailable.
 */
export class AIProviderError extends AtlasError {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}

/**
 * Client sent invalid or missing input (missing required fields, wrong types).
 * Mapped to HTTP 400 — the client needs to fix their request.
 */
export class ValidationError extends AtlasError {
  constructor(
    message: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * The requested resource does not exist or does not belong to the current user.
 * Mapped to HTTP 404 — silently; never leak whether a record exists.
 */
export class NotFoundError extends AtlasError {
  constructor(entity: string, id: string) {
    super(`Resource not found`);
    this.name = "NotFoundError";
    // Store for server-side logging only — not exposed to client
    Object.defineProperty(this, "_entity", { value: entity, enumerable: false });
    Object.defineProperty(this, "_id", { value: id, enumerable: false });
  }
}

/**
 * Document processing failed (corrupt file, unsupported format, extraction error).
 * Mapped to HTTP 422 — the file couldn't be processed.
 */
export class ProcessingError extends AtlasError {
  constructor(
    message: string,
    public readonly documentId: string,
  ) {
    super(message);
    this.name = "ProcessingError";
  }
}

/**
 * Request was rejected because the user is not authenticated.
 * Mapped to HTTP 401.
 */
export class UnauthorizedError extends AtlasError {
  constructor() {
    super("Authentication required");
    this.name = "UnauthorizedError";
  }
}

/**
 * The user has hit a rate limit or quota.
 * Mapped to HTTP 429.
 */
export class RateLimitError extends AtlasError {
  constructor(
    message: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "RateLimitError";
  }
}