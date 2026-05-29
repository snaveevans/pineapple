export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class NotFoundError extends DomainError {}
export class ForbiddenError extends DomainError {}
export class ConflictError extends DomainError {}

/** The caller is not authenticated — no valid session/credentials present. */
export class UnauthorizedError extends DomainError {}

/** A domain invariant was violated — indicates a programming error, not a user error. */
export class InvariantError extends DomainError {}

export class ValidationError extends DomainError {
  constructor(
    message: string,
    public readonly field?: string,
  ) {
    super(message);
  }
}
