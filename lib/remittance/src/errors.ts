export type DomainErrorCode =
  | "INVALID_ARGUMENT"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID_TRANSITION"
  | "QUOTE_EXPIRED"
  | "QUOTE_ALREADY_USED"
  | "ACTOR_NOT_ALLOWED"
  | "INSUFFICIENT_FUNDS";

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details?: Readonly<Record<string, string>>;

  constructor(
    code: DomainErrorCode,
    message: string,
    details?: Readonly<Record<string, string>>,
  ) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.details = details;
  }
}

export function assertDomain(
  condition: unknown,
  code: DomainErrorCode,
  message: string,
  details?: Readonly<Record<string, string>>,
): asserts condition {
  if (!condition) {
    throw new DomainError(code, message, details);
  }
}
