import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import type { PostgresPersistenceContext } from "./postgres-persistence";

const scrypt = promisify(scryptCallback);
const SESSION_BYTES = 32;
const PASSWORD_KEY_BYTES = 64;
const DEFAULT_SESSION_TTL_MS = 8 * 60 * 60 * 1_000;
const MAX_FAILED_LOGINS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1_000;

export const WORKFORCE_ROLES = Object.freeze([
  "support_readonly",
  "operations_analyst",
  "compliance_readonly",
  "administrator",
] as const);

export type WorkforceRole = (typeof WORKFORCE_ROLES)[number];
export type WorkforceIdentity = Readonly<{
  id: string;
  externalRef: string;
  displayName: string;
  role: WorkforceRole;
  sessionId: string;
  expiresAt: string;
}>;

export type WorkforceSessionIssue = Readonly<{
  token: string;
  identity: WorkforceIdentity;
}>;

type WorkforceUserRow = {
  id: string;
  external_ref: string;
  login_name: string;
  display_name: string;
  role: WorkforceRole;
  state: "active" | "disabled";
  password_salt: string;
  password_hash: string;
  failed_login_count: number;
  locked_until: Date | null;
};

export class WorkforceAuthenticationError extends Error {
  constructor() {
    super("The workforce credentials are invalid.");
    this.name = "WorkforceAuthenticationError";
  }
}

export class PostgresWorkforceAuthStore {
  readonly #context: PostgresPersistenceContext;
  readonly #sessionTtlMs: number;

  constructor(
    context: PostgresPersistenceContext,
    options: Readonly<{ sessionTtlMs?: number }> = {},
  ) {
    this.#context = context;
    this.#sessionTtlMs = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
  }

  async authenticate(
    loginName: string,
    password: string,
    now = new Date(),
  ): Promise<WorkforceSessionIssue> {
    const normalizedLogin = normalizeLogin(loginName);
    const query = this.#context.query();
    const result = await query.query<WorkforceUserRow>(
      `SELECT id, external_ref, login_name, display_name, role, state,
              password_salt, password_hash, failed_login_count, locked_until
       FROM samra_core.workforce_users
       WHERE lower(login_name) = $1
       LIMIT 1`,
      [normalizedLogin],
    );
    const user = result.rows[0];
    if (
      !user ||
      user.state !== "active" ||
      (user.locked_until && user.locked_until > now)
    ) {
      // Keep unknown, disabled, and locked identities on the same expensive
      // password path to reduce login-name timing disclosure.
      await derivePasswordHash(password, "samra-workforce-dummy-salt");
      throw new WorkforceAuthenticationError();
    }
    const valid = await verifyPassword(
      password,
      user.password_salt,
      user.password_hash,
    );
    if (!valid) {
      await query.query(
        `UPDATE samra_core.workforce_users
         SET failed_login_count = failed_login_count + 1,
             locked_until = CASE WHEN failed_login_count + 1 >= $2
                                 THEN $3 ELSE locked_until END,
             updated_at = $1
         WHERE id = $4`,
        [
          now,
          MAX_FAILED_LOGINS,
          new Date(now.getTime() + LOCK_DURATION_MS),
          user.id,
        ],
      );
      throw new WorkforceAuthenticationError();
    }

    const token = randomBytes(SESSION_BYTES).toString("base64url");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(now.getTime() + this.#sessionTtlMs);
    const session = await query.query<{ id: string }>(
      `INSERT INTO samra_core.workforce_sessions
       (user_id, token_hash, expires_at, last_seen_at, created_at)
       VALUES ($1,$2,$3,$4,$4)
       RETURNING id`,
      [user.id, tokenHash, expiresAt, now],
    );
    await query.query(
      `UPDATE samra_core.workforce_users
       SET failed_login_count = 0, locked_until = NULL,
           last_login_at = $1, updated_at = $1
       WHERE id = $2`,
      [now, user.id],
    );
    return Object.freeze({
      token,
      identity: identityFrom(user, session.rows[0]!.id, expiresAt),
    });
  }

  async resolveSession(
    token: string,
    now = new Date(),
  ): Promise<WorkforceIdentity | undefined> {
    if (!token || token.length > 512) return undefined;
    const result = await this.#context
      .query()
      .query<WorkforceUserRow & { session_id: string; expires_at: Date }>(
        `SELECT u.id, u.external_ref, u.login_name, u.display_name, u.role,
              u.state, u.password_salt, u.password_hash,
              u.failed_login_count, u.locked_until,
              s.id AS session_id, s.expires_at
       FROM samra_core.workforce_sessions s
       JOIN samra_core.workforce_users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL
         AND s.expires_at > $2 AND u.state = 'active'
       LIMIT 1`,
        [hashToken(token), now],
      );
    const row = result.rows[0];
    if (!row) return undefined;
    await this.#context
      .query()
      .query(
        `UPDATE samra_core.workforce_sessions SET last_seen_at = $1 WHERE id = $2`,
        [now, row.session_id],
      );
    return identityFrom(row, row.session_id, row.expires_at);
  }

  async revokeSession(token: string, now = new Date()): Promise<void> {
    await this.#context.query().query(
      `UPDATE samra_core.workforce_sessions
       SET revoked_at = COALESCE(revoked_at, $1)
       WHERE token_hash = $2`,
      [now, hashToken(token)],
    );
  }

  async upsertUser(
    input: Readonly<{
      externalRef: string;
      loginName: string;
      displayName: string;
      role: WorkforceRole;
      password: string;
      state?: "active" | "disabled";
    }>,
  ): Promise<void> {
    if (!WORKFORCE_ROLES.includes(input.role))
      throw new Error("Invalid workforce role.");
    if (input.password.length < 14)
      throw new Error(
        "Workforce passwords must contain at least 14 characters.",
      );
    const salt = randomBytes(16).toString("base64url");
    const passwordHash = await derivePasswordHash(input.password, salt);
    await this.#context.run(async () => {
      const query = this.#context.query();
      const user = await query.query<{ id: string }>(
        `INSERT INTO samra_core.workforce_users
         (external_ref, login_name, display_name, role, state,
          password_salt, password_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (external_ref) DO UPDATE SET
           login_name = EXCLUDED.login_name,
           display_name = EXCLUDED.display_name,
           role = EXCLUDED.role,
           state = EXCLUDED.state,
           password_salt = EXCLUDED.password_salt,
           password_hash = EXCLUDED.password_hash,
           failed_login_count = 0,
           locked_until = NULL,
           updated_at = now()
         RETURNING id`,
        [
          input.externalRef,
          normalizeLogin(input.loginName),
          input.displayName.trim(),
          input.role,
          input.state ?? "active",
          salt,
          passwordHash,
        ],
      );
      await query.query(
        `UPDATE samra_core.workforce_sessions
         SET revoked_at = COALESCE(revoked_at, now())
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [user.rows[0]!.id],
      );
    });
  }
}

function identityFrom(
  row: Pick<WorkforceUserRow, "id" | "external_ref" | "display_name" | "role">,
  sessionId: string,
  expiresAt: Date,
): WorkforceIdentity {
  return Object.freeze({
    id: row.id,
    externalRef: row.external_ref,
    displayName: row.display_name,
    role: row.role,
    sessionId,
    expiresAt: expiresAt.toISOString(),
  });
}

function normalizeLogin(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > 254)
    throw new WorkforceAuthenticationError();
  return normalized;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

async function derivePasswordHash(
  password: string,
  salt: string,
): Promise<string> {
  const value = (await scrypt(password, salt, PASSWORD_KEY_BYTES)) as Buffer;
  return value.toString("base64url");
}

async function verifyPassword(
  password: string,
  salt: string,
  expected: string,
): Promise<boolean> {
  const actual = Buffer.from(
    await derivePasswordHash(password, salt),
    "base64url",
  );
  const expectedBuffer = Buffer.from(expected, "base64url");
  return (
    actual.length === expectedBuffer.length &&
    timingSafeEqual(actual, expectedBuffer)
  );
}
