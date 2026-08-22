export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class NotFoundError extends DomainError {}
export class ForbiddenError extends DomainError {}
export class ConflictError extends DomainError {}

/** The caller has exceeded a rate limit and should retry later. */
export class TooManyRequestsError extends DomainError {}

/** The caller is not authenticated — no valid session/credentials present. */
export class UnauthorizedError extends DomainError {}

/** A domain invariant was violated — indicates a programming error, not a user error. */
export class InvariantError extends DomainError {}

/** A service or write gate is temporarily unavailable/frozen. */
export class ServiceUnavailableError extends DomainError {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
  }
}

export class ValidationError extends DomainError {
  constructor(
    message: string,
    public readonly field?: string,
  ) {
    super(message);
  }
}
