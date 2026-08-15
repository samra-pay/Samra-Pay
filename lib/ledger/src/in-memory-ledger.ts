import {
  DuplicateEntityError,
  DuplicateSourceError,
  HoldStateError,
  IdempotencyConflictError,
  InsufficientAvailableBalanceError,
  InvalidLedgerInputError,
  JournalAlreadyReversedError,
  NotFoundError,
} from "./errors.js";
import type {
  AccountBalance,
  AccountType,
  ActiveLedgerHold,
  CaptureHoldCommand,
  CaptureHoldResult,
  CapturedLedgerHold,
  CreateAccountCommand,
  CreateHoldCommand,
  EntrySide,
  ExpiredLedgerHold,
  InMemoryLedgerOptions,
  JournalDraft,
  LedgerAccount,
  LedgerHold,
  LedgerPosting,
  LedgerRepository,
  LogicalSource,
  NormalSide,
  PostedJournal,
  PostingDraft,
  PostJournalCommand,
  ReleasedLedgerHold,
  ReverseJournalCommand,
} from "./types.js";

type IdempotencyRecord =
  | {
      readonly fingerprint: string;
      readonly kind: "capture";
      readonly result: CaptureHoldResult;
    }
  | {
      readonly fingerprint: string;
      readonly hold: LedgerHold;
      readonly kind: "hold";
    }
  | {
      readonly fingerprint: string;
      readonly journal: PostedJournal;
      readonly kind: "journal";
    };

interface ValidatedJournalDraft {
  readonly source: LogicalSource;
  readonly description: string;
  readonly currency: string;
  readonly postings: readonly PostingDraft[];
  readonly metadata: Readonly<Record<string, string>>;
}

const ACCOUNT_NORMAL_SIDES: Readonly<Record<AccountType, NormalSide>> =
  Object.freeze({
    asset: "debit",
    equity: "credit",
    expense: "debit",
    liability: "credit",
    revenue: "credit",
  });

function requireText(value: string, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidLedgerInputError(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function requireCurrency(value: string): string {
  const currency = requireText(value, "currency");
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new InvalidLedgerInputError(
      "currency must be a three-letter uppercase code",
    );
  }
  return currency;
}

function requirePositiveMinorUnits(value: bigint, label: string): bigint {
  if (typeof value !== "bigint" || value <= 0n) {
    throw new InvalidLedgerInputError(`${label} must be a positive bigint`);
  }
  return value;
}

function requireIsoTimestamp(value: string, label: string): string {
  const timestamp = requireText(value, label);
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    throw new InvalidLedgerInputError(`${label} must be a valid timestamp`);
  }
  return parsed.toISOString();
}

function freezeSource(source: LogicalSource): LogicalSource {
  return Object.freeze({
    type: requireText(source.type, "source.type"),
    id: requireText(source.id, "source.id"),
  });
}

function freezeMetadata(
  metadata: Readonly<Record<string, string>> | undefined,
): Readonly<Record<string, string>> {
  const copy: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata ?? {}).sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    const normalizedKey = requireText(key, "metadata key");
    if (typeof value !== "string") {
      throw new InvalidLedgerInputError(
        `metadata.${normalizedKey} must be a string`,
      );
    }
    copy[normalizedKey] = value;
  }
  return Object.freeze(copy);
}

function oppositeSide(side: EntrySide): EntrySide {
  return side === "debit" ? "credit" : "debit";
}

function naturalDelta(account: LedgerAccount, posting: PostingDraft): bigint {
  const debitDelta =
    posting.side === "debit" ? posting.amountMinor : -posting.amountMinor;
  return account.normalSide === "debit" ? debitDelta : -debitDelta;
}

function sourceKey(source: LogicalSource): string {
  return JSON.stringify([source.type, source.id]);
}

function journalFingerprint(
  operation: string,
  draft: JournalDraft,
  extra = "",
): string {
  const metadata = Object.entries(draft.metadata ?? {}).sort(
    ([left], [right]) => left.localeCompare(right),
  );
  return JSON.stringify({
    operation,
    extra,
    source: [draft.source.type, draft.source.id],
    description: draft.description,
    currency: draft.currency,
    postings: draft.postings.map((posting) => [
      posting.accountId,
      posting.side,
      posting.amountMinor.toString(),
      posting.memo ?? null,
    ]),
    metadata,
  });
}

function createDefaultClock(): () => Date {
  let nextMillisecond = Date.UTC(2000, 0, 1);
  return () => new Date(nextMillisecond++);
}

export class InMemoryLedgerRepository implements LedgerRepository {
  readonly #accounts = new Map<string, LedgerAccount>();
  readonly #holds = new Map<string, LedgerHold>();
  readonly #journals = new Map<string, PostedJournal>();
  readonly #holdSources = new Map<string, string>();
  readonly #journalSources = new Map<string, string>();
  readonly #journalReversals = new Map<string, string>();
  readonly #idempotency = new Map<string, IdempotencyRecord>();
  readonly #counters = new Map<string, number>();
  readonly #clock: () => Date;

  constructor(options: InMemoryLedgerOptions = {}) {
    this.#clock = options.clock ?? createDefaultClock();
  }

  createAccount(command: CreateAccountCommand): LedgerAccount {
    const id =
      command.id === undefined
        ? this.#nextId("account")
        : requireText(command.id, "id");
    if (this.#accounts.has(id)) {
      throw new DuplicateEntityError("account", id);
    }

    const normalSide = ACCOUNT_NORMAL_SIDES[command.type];
    if (normalSide === undefined) {
      throw new InvalidLedgerInputError(
        `unsupported account type: ${String(command.type)}`,
      );
    }

    const account: LedgerAccount = Object.freeze({
      id,
      name: requireText(command.name, "name"),
      type: command.type,
      normalSide,
      currency: requireCurrency(command.currency),
      enforceAvailableBalance: command.enforceAvailableBalance ?? false,
      createdAt: this.#timestamp(),
    });
    this.#accounts.set(account.id, account);
    return account;
  }

  getAccount(accountId: string): LedgerAccount {
    const account = this.#accounts.get(accountId);
    if (account === undefined) {
      throw new NotFoundError("account", accountId);
    }
    return account;
  }

  listAccounts(): readonly LedgerAccount[] {
    return Object.freeze([...this.#accounts.values()]);
  }

  postJournal(command: PostJournalCommand): PostedJournal {
    const fingerprint = journalFingerprint("post", command);
    const idempotent = this.#readIdempotent(
      command.idempotencyKey,
      fingerprint,
      "journal",
    );
    if (idempotent !== undefined && idempotent.kind === "journal") {
      return idempotent.journal;
    }

    const draft = this.#validateJournal(command);
    this.#assertJournalSourceAvailable(draft.source);
    const journal = this.#commitJournal(draft);
    this.#journalSources.set(sourceKey(draft.source), journal.id);
    this.#storeIdempotency(command.idempotencyKey, {
      fingerprint,
      kind: "journal",
      journal,
    });
    return journal;
  }

  reverseJournal(command: ReverseJournalCommand): PostedJournal {
    const source = freezeSource(command.source);
    const original = this.getJournal(command.journalId);
    const reversalDraft: JournalDraft = {
      source,
      description:
        command.description === undefined
          ? `Reversal of ${original.id}: ${original.description}`
          : command.description,
      currency: original.currency,
      postings: original.postings.map((posting) => ({
        accountId: posting.accountId,
        side: oppositeSide(posting.side),
        amountMinor: posting.amountMinor,
        ...(posting.memo === undefined ? {} : { memo: posting.memo }),
      })),
      metadata: { reversalOfJournalId: original.id },
    };
    const fingerprint = journalFingerprint(
      "reverse",
      reversalDraft,
      original.id,
    );
    const idempotent = this.#readIdempotent(
      command.idempotencyKey,
      fingerprint,
      "journal",
    );
    if (idempotent !== undefined && idempotent.kind === "journal") {
      return idempotent.journal;
    }

    if (this.#journalReversals.has(original.id)) {
      throw new JournalAlreadyReversedError(original.id);
    }

    const validated = this.#validateJournal(reversalDraft);
    this.#assertJournalSourceAvailable(validated.source);
    const reversal = this.#commitJournal(validated, original.id);
    this.#journalSources.set(sourceKey(validated.source), reversal.id);
    this.#journalReversals.set(original.id, reversal.id);
    this.#storeIdempotency(command.idempotencyKey, {
      fingerprint,
      kind: "journal",
      journal: reversal,
    });
    return reversal;
  }

  getJournal(journalId: string): PostedJournal {
    const journal = this.#journals.get(journalId);
    if (journal === undefined) {
      throw new NotFoundError("journal", journalId);
    }
    return journal;
  }

  getReversalForJournal(journalId: string): PostedJournal | undefined {
    const reversalId = this.#journalReversals.get(journalId);
    return reversalId === undefined ? undefined : this.getJournal(reversalId);
  }

  listJournals(): readonly PostedJournal[] {
    return Object.freeze([...this.#journals.values()]);
  }

  createHold(command: CreateHoldCommand): ActiveLedgerHold {
    const accountId = requireText(command.accountId, "accountId");
    const amountMinor = requirePositiveMinorUnits(
      command.amountMinor,
      "amountMinor",
    );
    const source = freezeSource(command.source);
    const expiresAt =
      command.expiresAt === undefined
        ? undefined
        : requireIsoTimestamp(command.expiresAt, "expiresAt");
    const fingerprint = JSON.stringify({
      operation: "create-hold",
      accountId,
      amountMinor: amountMinor.toString(),
      source: [source.type, source.id],
      expiresAt: expiresAt ?? null,
    });
    const idempotent = this.#readIdempotent(
      command.idempotencyKey,
      fingerprint,
      "hold",
    );
    if (idempotent !== undefined && idempotent.kind === "hold") {
      if (idempotent.hold.status !== "active") {
        throw new InvalidLedgerInputError(
          "stored create-hold idempotency response is not the original active hold",
        );
      }
      return idempotent.hold;
    }

    const account = this.getAccount(accountId);
    const existingSource = this.#holdSources.get(sourceKey(source));
    if (existingSource !== undefined) {
      throw new DuplicateSourceError("hold", source.type, source.id);
    }

    const createdAt = this.#timestamp();
    if (expiresAt !== undefined && expiresAt <= createdAt) {
      throw new InvalidLedgerInputError(
        "expiresAt must be later than the hold creation time",
      );
    }

    const balance = this.getAccountBalance(account.id);
    const attemptedAvailable = balance.availableMinor - amountMinor;
    if (account.enforceAvailableBalance && attemptedAvailable < 0n) {
      throw new InsufficientAvailableBalanceError(
        account.id,
        balance.availableMinor,
        attemptedAvailable,
      );
    }

    const hold: ActiveLedgerHold = Object.freeze({
      id: this.#nextId("hold"),
      accountId: account.id,
      amountMinor,
      source,
      status: "active",
      createdAt,
      ...(expiresAt === undefined ? {} : { expiresAt }),
    });
    this.#holds.set(hold.id, hold);
    this.#holdSources.set(sourceKey(source), hold.id);
    this.#storeIdempotency(command.idempotencyKey, {
      fingerprint,
      kind: "hold",
      hold,
    });
    return hold;
  }

  captureHold(command: CaptureHoldCommand): CaptureHoldResult {
    const holdId = requireText(command.holdId, "holdId");
    const fingerprint = journalFingerprint(
      "capture-hold",
      command.journal,
      holdId,
    );
    const idempotent = this.#readIdempotent(
      command.idempotencyKey,
      fingerprint,
      "capture",
    );
    if (idempotent !== undefined && idempotent.kind === "capture") {
      return idempotent.result;
    }

    const hold = this.#requireActiveHold(holdId, "captured");
    const validated = this.#validateJournal(command.journal, hold.id);
    this.#assertJournalSourceAvailable(validated.source);
    const account = this.getAccount(hold.accountId);
    const heldAccountDelta = validated.postings
      .filter((posting) => posting.accountId === hold.accountId)
      .reduce((total, posting) => total + naturalDelta(account, posting), 0n);
    if (heldAccountDelta !== -hold.amountMinor) {
      throw new InvalidLedgerInputError(
        `capture journal must reduce held account ${hold.accountId} by exactly ${hold.amountMinor.toString()} minor units`,
      );
    }

    const journal = this.#commitJournal(validated);
    this.#journalSources.set(sourceKey(validated.source), journal.id);
    const captured: CapturedLedgerHold = Object.freeze({
      ...hold,
      status: "captured",
      resolvedAt: this.#timestamp(),
      capturedByJournalId: journal.id,
    });
    this.#holds.set(hold.id, captured);
    const result: CaptureHoldResult = Object.freeze({
      hold: captured,
      journal,
    });
    this.#storeIdempotency(command.idempotencyKey, {
      fingerprint,
      kind: "capture",
      result,
    });
    return result;
  }

  releaseHold(holdId: string, reason?: string): ReleasedLedgerHold {
    const hold = this.#requireActiveHold(holdId, "released");
    const resolutionReason =
      reason === undefined ? undefined : requireText(reason, "reason");
    const released: ReleasedLedgerHold = Object.freeze({
      ...hold,
      status: "released",
      resolvedAt: this.#timestamp(),
      ...(resolutionReason === undefined ? {} : { resolutionReason }),
    });
    this.#holds.set(hold.id, released);
    return released;
  }

  expireHold(holdId: string, at?: string): ExpiredLedgerHold {
    const hold = this.#requireActiveHold(holdId, "expired");
    if (hold.expiresAt === undefined) {
      throw new InvalidLedgerInputError(
        `hold ${hold.id} has no expiration time`,
      );
    }
    const resolvedAt =
      at === undefined ? this.#timestamp() : requireIsoTimestamp(at, "at");
    if (resolvedAt < hold.expiresAt) {
      throw new InvalidLedgerInputError(`hold ${hold.id} is not due to expire`);
    }
    const expired: ExpiredLedgerHold = Object.freeze({
      ...hold,
      status: "expired",
      resolvedAt,
    });
    this.#holds.set(hold.id, expired);
    return expired;
  }

  getHold(holdId: string): LedgerHold {
    const hold = this.#holds.get(holdId);
    if (hold === undefined) {
      throw new NotFoundError("hold", holdId);
    }
    return hold;
  }

  listHolds(accountId?: string): readonly LedgerHold[] {
    if (accountId !== undefined) {
      this.getAccount(accountId);
    }
    return Object.freeze(
      [...this.#holds.values()].filter(
        (hold) => accountId === undefined || hold.accountId === accountId,
      ),
    );
  }

  getAccountBalance(accountId: string): AccountBalance {
    const account = this.getAccount(accountId);
    let debitPostedMinor = 0n;
    let creditPostedMinor = 0n;
    for (const journal of this.#journals.values()) {
      for (const posting of journal.postings) {
        if (posting.accountId !== account.id) {
          continue;
        }
        if (posting.side === "debit") {
          debitPostedMinor += posting.amountMinor;
        } else {
          creditPostedMinor += posting.amountMinor;
        }
      }
    }
    const postedBalanceMinor = debitPostedMinor - creditPostedMinor;
    const naturalBalanceMinor =
      account.normalSide === "debit" ? postedBalanceMinor : -postedBalanceMinor;
    const heldMinor = this.#activeHeldMinor(account.id);
    return Object.freeze({
      accountId: account.id,
      currency: account.currency,
      normalSide: account.normalSide,
      debitPostedMinor,
      creditPostedMinor,
      postedBalanceMinor,
      naturalBalanceMinor,
      heldMinor,
      availableMinor: naturalBalanceMinor - heldMinor,
    });
  }

  #validateJournal(
    draft: JournalDraft,
    ignoredHoldId?: string,
  ): ValidatedJournalDraft {
    const source = freezeSource(draft.source);
    const description = requireText(draft.description, "description");
    const currency = requireCurrency(draft.currency);
    if (!Array.isArray(draft.postings) || draft.postings.length < 2) {
      throw new InvalidLedgerInputError(
        "journal must contain at least two postings",
      );
    }

    let debitTotal = 0n;
    let creditTotal = 0n;
    const accountDeltas = new Map<string, bigint>();
    const postings = draft.postings.map((input, index): PostingDraft => {
      const accountId = requireText(
        input.accountId,
        `postings[${index}].accountId`,
      );
      const account = this.getAccount(accountId);
      if (account.currency !== currency) {
        throw new InvalidLedgerInputError(
          `journal currency ${currency} does not match account ${account.id} currency ${account.currency}`,
        );
      }
      if (input.side !== "debit" && input.side !== "credit") {
        throw new InvalidLedgerInputError(
          `postings[${index}].side must be debit or credit`,
        );
      }
      const amountMinor = requirePositiveMinorUnits(
        input.amountMinor,
        `postings[${index}].amountMinor`,
      );
      if (input.side === "debit") {
        debitTotal += amountMinor;
      } else {
        creditTotal += amountMinor;
      }
      const posting: PostingDraft = Object.freeze({
        accountId,
        side: input.side,
        amountMinor,
        ...(input.memo === undefined
          ? {}
          : { memo: requireText(input.memo, `postings[${index}].memo`) }),
      });
      accountDeltas.set(
        account.id,
        (accountDeltas.get(account.id) ?? 0n) + naturalDelta(account, posting),
      );
      return posting;
    });

    if (debitTotal !== creditTotal) {
      throw new InvalidLedgerInputError(
        `journal is not balanced: debits=${debitTotal.toString()} credits=${creditTotal.toString()}`,
      );
    }

    for (const [accountId, delta] of accountDeltas) {
      const account = this.getAccount(accountId);
      if (!account.enforceAvailableBalance) {
        continue;
      }
      const balance = this.getAccountBalance(accountId);
      const ignoredHeldMinor =
        ignoredHoldId === undefined
          ? 0n
          : this.#heldAmountForAccount(ignoredHoldId, accountId);
      const heldAfter = balance.heldMinor - ignoredHeldMinor;
      const attemptedAvailable =
        balance.naturalBalanceMinor + delta - heldAfter;
      if (attemptedAvailable < 0n) {
        throw new InsufficientAvailableBalanceError(
          accountId,
          balance.availableMinor,
          attemptedAvailable,
        );
      }
    }

    return Object.freeze({
      source,
      description,
      currency,
      postings: Object.freeze(postings),
      metadata: freezeMetadata(draft.metadata),
    });
  }

  #commitJournal(
    draft: ValidatedJournalDraft,
    reversalOfJournalId?: string,
  ): PostedJournal {
    const journalId = this.#nextId("journal");
    const postings: readonly LedgerPosting[] = Object.freeze(
      draft.postings.map((posting) =>
        Object.freeze({
          id: this.#nextId("posting"),
          journalId,
          accountId: posting.accountId,
          side: posting.side,
          amountMinor: posting.amountMinor,
          ...(posting.memo === undefined ? {} : { memo: posting.memo }),
        }),
      ),
    );
    const journal: PostedJournal = Object.freeze({
      id: journalId,
      status: "posted",
      source: draft.source,
      description: draft.description,
      currency: draft.currency,
      postings,
      metadata: draft.metadata,
      postedAt: this.#timestamp(),
      ...(reversalOfJournalId === undefined ? {} : { reversalOfJournalId }),
    });
    this.#journals.set(journal.id, journal);
    return journal;
  }

  #assertJournalSourceAvailable(source: LogicalSource): void {
    if (this.#journalSources.has(sourceKey(source))) {
      throw new DuplicateSourceError("journal", source.type, source.id);
    }
  }

  #requireActiveHold(holdId: string, transition: string): ActiveLedgerHold {
    const hold = this.getHold(requireText(holdId, "holdId"));
    if (hold.status !== "active") {
      throw new HoldStateError(hold.id, hold.status, transition);
    }
    return hold;
  }

  #activeHeldMinor(accountId: string): bigint {
    let total = 0n;
    for (const hold of this.#holds.values()) {
      if (hold.accountId === accountId && hold.status === "active") {
        total += hold.amountMinor;
      }
    }
    return total;
  }

  #heldAmountForAccount(holdId: string, accountId: string): bigint {
    const hold = this.#holds.get(holdId);
    return hold?.status === "active" && hold.accountId === accountId
      ? hold.amountMinor
      : 0n;
  }

  #readIdempotent(
    key: string | undefined,
    fingerprint: string,
    kind: IdempotencyRecord["kind"],
  ): IdempotencyRecord | undefined {
    if (key === undefined) {
      return undefined;
    }
    const normalizedKey = requireText(key, "idempotencyKey");
    const existing = this.#idempotency.get(normalizedKey);
    if (existing === undefined) {
      return undefined;
    }
    if (existing.fingerprint !== fingerprint || existing.kind !== kind) {
      throw new IdempotencyConflictError(normalizedKey);
    }
    return existing;
  }

  #storeIdempotency(key: string | undefined, record: IdempotencyRecord): void {
    if (key !== undefined) {
      this.#idempotency.set(requireText(key, "idempotencyKey"), record);
    }
  }

  #nextId(kind: string): string {
    const next = (this.#counters.get(kind) ?? 0) + 1;
    this.#counters.set(kind, next);
    return `${kind}_${next.toString().padStart(6, "0")}`;
  }

  #timestamp(): string {
    const value = this.#clock();
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new InvalidLedgerInputError("clock must return a valid Date");
    }
    return value.toISOString();
  }
}
