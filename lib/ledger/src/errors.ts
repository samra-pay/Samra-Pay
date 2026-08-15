export type LedgerErrorCode =
  | "DUPLICATE_ENTITY"
  | "DUPLICATE_SOURCE"
  | "HOLD_STATE_CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "INSUFFICIENT_AVAILABLE_BALANCE"
  | "INVALID_LEDGER_INPUT"
  | "JOURNAL_ALREADY_REVERSED"
  | "NOT_FOUND";

export class LedgerError extends Error {
  readonly code: LedgerErrorCode;

  constructor(code: LedgerErrorCode, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class InvalidLedgerInputError extends LedgerError {
  constructor(message: string) {
    super("INVALID_LEDGER_INPUT", message);
  }
}

export class NotFoundError extends LedgerError {
  constructor(entity: string, id: string) {
    super("NOT_FOUND", `${entity} not found: ${id}`);
  }
}

export class DuplicateEntityError extends LedgerError {
  constructor(entity: string, id: string) {
    super("DUPLICATE_ENTITY", `${entity} already exists: ${id}`);
  }
}

export class DuplicateSourceError extends LedgerError {
  constructor(
    resource: "hold" | "journal",
    sourceType: string,
    sourceId: string,
  ) {
    super(
      "DUPLICATE_SOURCE",
      `${resource} logical source already exists: ${sourceType}/${sourceId}`,
    );
  }
}

export class IdempotencyConflictError extends LedgerError {
  constructor(key: string) {
    super(
      "IDEMPOTENCY_CONFLICT",
      `idempotency key was already used with a different command: ${key}`,
    );
  }
}

export class InsufficientAvailableBalanceError extends LedgerError {
  readonly accountId: string;
  readonly availableMinor: bigint;
  readonly attemptedAvailableMinor: bigint;

  constructor(
    accountId: string,
    availableMinor: bigint,
    attemptedAvailableMinor: bigint,
  ) {
    super(
      "INSUFFICIENT_AVAILABLE_BALANCE",
      `account ${accountId} has ${availableMinor.toString()} available minor units; command would leave ${attemptedAvailableMinor.toString()}`,
    );
    this.accountId = accountId;
    this.availableMinor = availableMinor;
    this.attemptedAvailableMinor = attemptedAvailableMinor;
  }
}

export class HoldStateError extends LedgerError {
  constructor(holdId: string, status: string, attemptedTransition: string) {
    super(
      "HOLD_STATE_CONFLICT",
      `hold ${holdId} is ${status} and cannot be ${attemptedTransition}`,
    );
  }
}

export class JournalAlreadyReversedError extends LedgerError {
  constructor(journalId: string) {
    super("JOURNAL_ALREADY_REVERSED", `journal already reversed: ${journalId}`);
  }
}
