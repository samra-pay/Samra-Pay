import { execFileSync } from "node:child_process";
import type { ExecFileSyncOptionsWithStringEncoding } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

type ObjectValue = Record<string, unknown>;
type Reader = (endpoint: string, paginate?: boolean) => unknown;
type CommandRunner = (
  file: string,
  args: readonly string[],
  options: ExecFileSyncOptionsWithStringEncoding,
) => string;
export type AuditTarget = {
  repository: string;
  repositoryId: string;
  ownerId: string;
  expectedSha: string;
};
type Policy = {
  protectedBranch: string;
  requiredChecks: { name: string }[];
  requiredRepositorySettings: Record<string, boolean>;
};
type Control = { id: string; status: "satisfied" | "missing" | "unverified" };
type Observation = {
  endpoint: string;
  result: "read" | "unavailable";
  sha256?: string;
  httpStatus?: number | null;
};
const root = resolve(import.meta.dirname, "../..");
const object = (value: unknown): ObjectValue =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as ObjectValue)
    : {};
const positiveId = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) > 0;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object") {
    return (
      "{" +
      Object.entries(object(value))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => JSON.stringify(key) + ":" + canonical(entry))
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(value) ?? "null";
}
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const ruleFingerprint = (rules: unknown[]) =>
  hash(rules.map(canonical).sort().join("\n"));

export class GitHubReadError extends Error {
  readonly httpStatus: number | null;
  constructor(httpStatus: number | null = null) {
    super("GitHub metadata read unavailable.");
    this.httpStatus = httpStatus;
  }
}

// No shell, writes, workflow dispatch, credential extraction, or response logging.
export function githubGet(
  endpoint: string,
  paginate = false,
  execute: CommandRunner = execFileSync,
): unknown {
  try {
    const output = execute(
      "gh",
      [
        "api",
        "--hostname",
        "github.com",
        "--method",
        "GET",
        "--header",
        "Accept: application/vnd.github+json",
        "--header",
        "X-GitHub-Api-Version: 2022-11-28",
        ...(paginate ? ["--paginate", "--slurp"] : []),
        endpoint,
      ],
      {
        encoding: "utf8",
        timeout: 30_000,
        maxBuffer: 2 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, GH_DEBUG: "", GH_PROMPT_DISABLED: "1" },
      },
    );
    const value: unknown = JSON.parse(output);
    if (!paginate) return value;
    if (!Array.isArray(value) || !value.every(Array.isArray)) {
      throw new GitHubReadError();
    }
    return value.flat();
  } catch (error) {
    if (error instanceof GitHubReadError) throw error;
    // Never propagate raw stderr/stdout, including auth-debug or API bodies.
    const status = /HTTP (\d{3})/u.exec(String(object(error).stderr ?? ""));
    throw new GitHubReadError(status ? Number(status[1]) : null);
  }
}

export function auditRepositorySettings(
  target: AuditTarget,
  policy: Policy,
  read: Reader = githubGet,
) {
  if (
    !/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/u.test(
      target.repository,
    ) ||
    !/^[1-9]\d*$/u.test(target.repositoryId) ||
    !/^[1-9]\d*$/u.test(target.ownerId) ||
    !/^[a-f0-9]{40}$/u.test(target.expectedSha)
  ) {
    throw new Error(
      "An exact repository identity and 40-character SHA are required.",
    );
  }
  const settings = [
    "requirePullRequest",
    "requireUpToDateBranch",
    "requireMergeQueue",
    "blockForcePushes",
    "blockDeletions",
  ];
  const names = policy.requiredChecks?.map((check) => check.name);
  if (
    policy.protectedBranch !== "main" ||
    !Array.isArray(names) ||
    names.length < 2 ||
    !names.every((name) => typeof name === "string" && name.length > 0) ||
    new Set(names).size !== names.length ||
    !settings.every(
      (setting) => policy.requiredRepositorySettings?.[setting] === true,
    )
  ) {
    throw new Error("The complete repository control policy is required.");
  }
  const startedAt = new Date().toISOString();
  const observations: Observation[] = [];
  const controls: Control[] = [];
  function get(endpoint: string, paginate = false): unknown {
    try {
      const data = read(endpoint, paginate);
      observations.push({
        endpoint,
        result: "read",
        sha256: hash(canonical(data)),
      });
      return data;
    } catch (error) {
      observations.push({
        endpoint,
        result: "unavailable",
        httpStatus: error instanceof GitHubReadError ? error.httpStatus : null,
      });
      return undefined;
    }
  }
  function control(id: string, known: boolean, satisfied: boolean) {
    controls.push({
      id,
      status: !known ? "unverified" : satisfied ? "satisfied" : "missing",
    });
  }
  const base = "repos/" + target.repository;
  const branchPath = base + "/branches/main";
  const rulesPath = base + "/rules/branches/main?per_page=100";
  const repoBefore = get(base);
  const branchBefore = get(branchPath);
  const rawRules = get(rulesPath, true);
  const rules = Array.isArray(rawRules) ? rawRules : [];
  const validRule = (value: unknown) => {
    const rule = object(value);
    return (
      typeof rule.type === "string" &&
      positiveId(rule.ruleset_id) &&
      typeof rule.ruleset_source === "string" &&
      ["Repository", "Organization", "Enterprise"].includes(
        String(rule.ruleset_source_type),
      )
    );
  };
  const rulesValid = Array.isArray(rawRules) && rules.every(validRule);
  const ids = [
    ...new Set(rules.map((rule) => object(rule).ruleset_id).filter(positiveId)),
  ];
  const details = new Map<number, unknown>();
  // Refuse incomplete or unexpectedly large evidence instead of silently truncating.
  if (rulesValid && ids.length <= 30) {
    for (const id of ids) {
      details.set(id, get(base + "/rulesets/" + id + "?includes_parents=true"));
    }
  }
  const rulesAfter = get(rulesPath, true);
  const branchAfter = get(branchPath);
  const repoAfter = get(base);
  const identity = (value: unknown) => {
    const repo = object(value);
    return (
      repo.full_name === target.repository &&
      String(repo.id) === target.repositoryId &&
      String(object(repo.owner).id) === target.ownerId &&
      repo.private === true &&
      repo.default_branch === "main" &&
      repo.archived === false
    );
  };
  control(
    "repository-identity",
    repoBefore !== undefined && repoAfter !== undefined,
    identity(repoBefore) && identity(repoAfter),
  );
  const branchMatches = (value: unknown) =>
    object(value).name === "main" &&
    object(object(value).commit).sha === target.expectedSha;
  control(
    "reviewed-main-sha",
    branchBefore !== undefined && branchAfter !== undefined,
    branchMatches(branchBefore) && branchMatches(branchAfter),
  );
  control(
    "branch-protected",
    typeof object(branchBefore).protected === "boolean" &&
      typeof object(branchAfter).protected === "boolean",
    object(branchBefore).protected === true &&
      object(branchAfter).protected === true,
  );
  const stableRules =
    rulesValid &&
    Array.isArray(rulesAfter) &&
    rulesAfter.every(validRule) &&
    ruleFingerprint(rules) === ruleFingerprint(rulesAfter);
  control(
    "complete-stable-rules",
    rulesValid && Array.isArray(rulesAfter),
    stableRules && ids.length <= 30,
  );
  const completeDetails =
    ids.length > 0 &&
    ids.length <= 30 &&
    ids.every((id) => {
      const detail = object(details.get(id));
      return (
        detail.id === id &&
        detail.target === "branch" &&
        detail.enforcement === "active" &&
        rules
          .filter((rule) => object(rule).ruleset_id === id)
          .every(
            (rule) =>
              object(rule).ruleset_source === detail.source &&
              object(rule).ruleset_source_type === detail.source_type,
          ) &&
        Array.isArray(detail.bypass_actors)
      );
    });
  control(
    "no-ruleset-bypass",
    completeDetails,
    ids.every(
      (id) =>
        (object(details.get(id)).bypass_actors as unknown[])?.length === 0,
    ),
  );
  // Only branch-effective rules count; unrelated/evaluate/disabled rules cannot satisfy policy.
  const known = stableRules && completeDetails;
  const has = (type: string) =>
    rules.some((rule) => object(rule).type === type);
  control("pull-request-required", known, has("pull_request"));
  control("merge-queue-required", known, has("merge_queue"));
  control("force-push-blocked", known, has("non_fast_forward"));
  control("deletion-blocked", known, has("deletion"));
  const statusRules = rules.filter(
    (rule) => object(rule).type === "required_status_checks",
  );
  const containsCheck = (rule: unknown, name: string) => {
    const checks = object(object(rule).parameters).required_status_checks;
    return (
      Array.isArray(checks) &&
      checks.some((check) => object(check).context === name)
    );
  };
  for (const name of names) {
    control(
      "required-check:" + name,
      known,
      statusRules.some((rule) => containsCheck(rule, name)),
    );
    control(
      "up-to-date-check:" + name,
      known,
      statusRules.some(
        (rule) =>
          containsCheck(rule, name) &&
          object(object(rule).parameters)
            .strict_required_status_checks_policy === true,
      ),
    );
  }
  return {
    schemaVersion: 1,
    scope: "github-merge-settings-only",
    status:
      controls.every((entry) => entry.status === "satisfied") &&
      observations.every((entry) => entry.result === "read")
        ? "enforced"
        : "blocked",
    startedAt,
    observedAt: new Date().toISOString(),
    ...target,
    branch: policy.protectedBranch,
    policySha256: hash(canonical(policy)),
    rulesetIds: ids,
    controls,
    observations,
    limitations: [
      "Point-in-time metadata evidence; not an atomic snapshot or a future guarantee.",
      "Does not verify CI results, independent review, deployment, or production readiness.",
      "Legacy branch protection alone cannot satisfy this ruleset-based contract.",
      "Missing bypass visibility is unverified, never an empty bypass list.",
    ],
  };
}

export function parseArguments(args: string[]) {
  if (
    args.length !== 2 ||
    args[0] !== "--expected-sha" ||
    !/^[a-f0-9]{40}$/u.test(args[1] ?? "")
  ) {
    throw new Error(
      "Usage: audit-repository-settings --expected-sha <40-character-main-SHA>",
    );
  }
  return args[1];
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const expectedSha = parseArguments(process.argv.slice(2));
    const policy = JSON.parse(
      readFileSync(
        resolve(root, "docs/testing/repository-controls.json"),
        "utf8",
      ),
    );
    const authority = JSON.parse(
      readFileSync(
        resolve(root, "deploy/gcp/staging-github-enterprise-migration.json"),
        "utf8",
      ),
    ).repository;
    const result = auditRepositorySettings(
      {
        repository: authority.activeAuthority.nameWithOwner,
        repositoryId: authority.stableId,
        ownerId: authority.activeAuthority.ownerId,
        expectedSha,
      },
      policy,
    );
    console.log(
      JSON.stringify(
        {
          ...result,
          auditorSha256: hash(readFileSync(process.argv[1], "utf8")),
        },
        null,
        2,
      ),
    );
    process.exitCode = result.status === "enforced" ? 0 : 2;
  } catch {
    console.error(
      "Repository settings audit failed. Check arguments, policy, and local tooling; no settings changed.",
    );
    process.exitCode = 1;
  }
}
