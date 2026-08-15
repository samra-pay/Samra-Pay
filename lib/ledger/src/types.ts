export type AccountType =
  "asset" | "equity" | "expense" | "liability" | "revenue";
export type EntrySide = "credit" | "debit";
export type HoldStatus = "active" | "captured" | "expired" | "released";
export type NormalSide = "credit" | "debit";

export interface LogicalSource {
  readonly type: string;
  readonly id: string;
}

export interface LedgerAccount {
  readonly id: string;
  readonly name: string;
  readonly type: AccountType;
  readonly normalSide: NormalSide;
  readonly currency: string;
  readonly enforceAvailableBalance: boolean;
  readonly createdAt: string;
}

export interface CreateAccountCommand {
  readonly id?: string;
  readonly name: string;
  readonly type: AccountType;
  readonly currency: string;
  readonly enforceAvailableBalance?: boolean;
}

export interface PostingDraft {
  readonly accountId: string;
  readonly side: EntrySide;
  readonly amountMinor: bigint;
  readonly memo?: string;
}

export interface JournalDraft {
  readonly source: LogicalSource;
  readonly description: string;
  readonly currency: string;
  readonly postings: readonly PostingDraft[];
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface PostJournalCommand extends JournalDraft {
  readonly idempotencyKey?: string;
}

export interface LedgerPosting {
  readonly id: string;
  readonly journalId: string;
  readonly accountId: string;
  readonly side: EntrySide;
  readonly amountMinor: bigint;
  readonly memo?: string;
}

export interface PostedJournal {
  readonly id: string;
  readonly status: "posted";
  readonly source: LogicalSource;
  readonly description: string;
  readonly currency: string;
  readonly postings: readonly LedgerPosting[];
  readonly metadata: Readonly<Record<string, string>>;
  readonly postedAt: string;
  readonly reversalOfJournalId?: string;
}

export interface ReverseJournalCommand {
  readonly journalId: string;
  readonly source: LogicalSource;
  readonly description?: string;
  readonly idempotencyKey?: string;
}

export interface CreateHoldCommand {
  readonly accountId: string;
  readonly amountMinor: bigint;
  readonly source: LogicalSource;
  readonly expiresAt?: string;
  readonly idempotencyKey?: string;
}

interface LedgerHoldBase {
  readonly id: string;
  readonly accountId: string;
  readonly amountMinor: bigint;
  readonly source: LogicalSource;
  readonly createdAt: string;
  readonly expiresAt?: string;
}

export interface ActiveLedgerHold extends LedgerHoldBase {
  readonly status: "active";
}

export interface CapturedLedgerHold extends LedgerHoldBase {
  readonly status: "captured";
  readonly resolvedAt: string;
  readonly capturedByJournalId: string;
}

export interface ReleasedLedgerHold extends LedgerHoldBase {
  readonly status: "released";
  readonly resolvedAt: string;
  readonly resolutionReason?: string;
}

export interface ExpiredLedgerHold extends LedgerHoldBase {
  readonly status: "expired";
  readonly resolvedAt: string;
}

export type LedgerHold =
  | ActiveLedgerHold
  | CapturedLedgerHold
  | ExpiredLedgerHold
  | ReleasedLedgerHold;

export interface CaptureHoldCommand {
  readonly holdId: string;
  readonly journal: JournalDraft;
  readonly idempotencyKey?: string;
}

export interface CaptureHoldResult {
  readonly hold: CapturedLedgerHold;
  readonly journal: PostedJournal;
}

export interface AccountBalance {
  readonly accountId: string;
  readonly currency: string;
  readonly normalSide: NormalSide;
  readonly debitPostedMinor: bigint;
  readonly creditPostedMinor: bigint;
  readonly postedBalanceMinor: bigint;
  readonly naturalBalanceMinor: bigint;
  readonly heldMinor: bigint;
  readonly availableMinor: bigint;
}

export interface InMemoryLedgerOptions {
  readonly clock?: () => Date;
}

/**
 * Storage boundary for ledger consumers. The in-memory implementation proves
 * behavior now; a database implementation can satisfy the same contract later.
 */
export interface LedgerRepository {
  createAccount(command: CreateAccountCommand): LedgerAccount;
  getAccount(accountId: string): LedgerAccount;
  listAccounts(): readonly LedgerAccount[];
  postJournal(command: PostJournalCommand): PostedJournal;
  reverseJournal(command: ReverseJournalCommand): PostedJournal;
  getJournal(journalId: string): PostedJournal;
  getReversalForJournal(journalId: string): PostedJournal | undefined;
  listJournals(): readonly PostedJournal[];
  createHold(command: CreateHoldCommand): ActiveLedgerHold;
  captureHold(command: CaptureHoldCommand): CaptureHoldResult;
  releaseHold(holdId: string, reason?: string): ReleasedLedgerHold;
  expireHold(holdId: string, at?: string): ExpiredLedgerHold;
  getHold(holdId: string): LedgerHold;
  listHolds(accountId?: string): readonly LedgerHold[];
  getAccountBalance(accountId: string): AccountBalance;
}
