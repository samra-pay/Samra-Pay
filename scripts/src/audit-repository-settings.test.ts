import { describe, expect, it, vi } from "vitest";
import {
  auditRepositorySettings,
  githubGet,
  GitHubReadError,
  parseArguments,
} from "./audit-repository-settings";
type CommandRunner = NonNullable<Parameters<typeof githubGet>[2]>;

const sha = "a".repeat(40);
const target = {
  repository: "fixture/private-repo",
  repositoryId: "100",
  ownerId: "200",
  expectedSha: sha,
};
const policy = {
  protectedBranch: "main",
  requiredChecks: [{ name: "Required CI" }, { name: "Required security" }],
  requiredRepositorySettings: {
    requirePullRequest: true,
    requireUpToDateBranch: true,
    requireMergeQueue: true,
    blockForcePushes: true,
    blockDeletions: true,
  },
};
const base = "repos/" + target.repository;
const rulesPath = base + "/rules/branches/main?per_page=100";
function fixture() {
  const repo = {
    id: 100,
    full_name: target.repository,
    owner: { id: 200 },
    private: true,
    archived: false,
    default_branch: "main",
  };
  const branch = { name: "main", protected: true, commit: { sha } };
  const rules: Record<string, unknown>[] = [
    { type: "pull_request" },
    { type: "merge_queue" },
    { type: "non_fast_forward" },
    { type: "deletion" },
    {
      type: "required_status_checks",
      parameters: {
        strict_required_status_checks_policy: true,
        required_status_checks: [
          { context: "Required CI" },
          { context: "Required security" },
        ],
      },
    },
  ].map((rule) => ({
    ...rule,
    ruleset_id: 11,
    ruleset_source_type: "Repository",
    ruleset_source: target.repository,
  }));
  const detail: Record<string, unknown> = {
    id: 11,
    target: "branch",
    enforcement: "active",
    source: target.repository,
    source_type: "Repository",
    bypass_actors: [],
  };
  const responses = new Map<string, unknown>([
    [base, repo],
    [base + "/branches/main", branch],
    [rulesPath, rules],
    [base + "/rulesets/11?includes_parents=true", detail],
  ]);
  const read = vi.fn((path: string) => {
    if (!responses.has(path)) throw new Error("Unexpected read");
    return structuredClone(responses.get(path));
  });
  return { repo, branch, rules, detail, responses, read };
}
const run = (f: ReturnType<typeof fixture>) =>
  auditRepositorySettings(target, policy, f.read);
const status = (report: ReturnType<typeof run>, id: string) =>
  report.controls.find((control) => control.id === id)?.status;

describe("read-only repository enforcement evidence", () => {
  it("accepts full active policy without inventing independent review or CI evidence", () => {
    const report = run(fixture());
    expect(report.status).toBe("enforced");
    expect(report.scope).toBe("github-merge-settings-only");
    expect(report.expectedSha).toBe(sha);
    expect(
      report.observations.every((read) => /^[a-f0-9]{64}$/.test(read.sha256!)),
    ).toBe(true);
    expect(report).not.toHaveProperty("ciPassed");
    expect(report).not.toHaveProperty("productionApproved");
  });

  it("combines effective repository and inherited organization rules", () => {
    const f = fixture();
    Object.assign(f.rules[1], {
      ruleset_id: 22,
      ruleset_source_type: "Organization",
      ruleset_source: "fixture",
    });
    f.responses.set(base + "/rulesets/22?includes_parents=true", {
      ...f.detail,
      id: 22,
      source_type: "Organization",
      source: "fixture",
    });
    expect(run(f).status).toBe("enforced");
  });

  it.each(["pull_request", "merge_queue", "non_fast_forward", "deletion"])(
    "rejects absent %s even when the branch is protected",
    (type) => {
      const f = fixture();
      f.responses.set(
        rulesPath,
        f.rules.filter((rule) => rule.type !== type),
      );
      expect(run(f).status).toBe("blocked");
    },
  );

  it("rejects a missing required check and a strict-policy decoy", () => {
    const f = fixture();
    f.rules[4].parameters = {
      strict_required_status_checks_policy: false,
      required_status_checks: [{ context: "Required CI" }],
    };
    f.rules.push({
      ...f.rules[4],
      parameters: {
        strict_required_status_checks_policy: true,
        required_status_checks: [],
      },
    });
    const report = run(f);
    expect(status(report, "required-check:Required security")).toBe("missing");
    expect(status(report, "up-to-date-check:Required CI")).toBe("missing");
    expect(report.status).toBe("blocked");
  });

  it.each([
    "active-bypass",
    "hidden-bypass",
    "evaluate",
    "disabled",
    "wrong-source",
  ])("never certifies %s ruleset evidence", (condition) => {
    const f = fixture();
    if (condition === "active-bypass")
      f.detail.bypass_actors = [{ actor_id: 1, bypass_mode: "always" }];
    if (condition === "hidden-bypass") delete f.detail.bypass_actors;
    if (condition === "evaluate" || condition === "disabled")
      f.detail.enforcement = condition;
    if (condition === "wrong-source")
      f.detail.source = "another-owner/another-repo";
    expect(run(f).status).toBe("blocked");
  });

  it("does not equate an empty/legacy-only effective rules response with enforcement", () => {
    const f = fixture();
    f.responses.set(rulesPath, []);
    expect(run(f).status).toBe("blocked");
  });

  it("rejects an unprotected branch, wrong repository identity, and unexpected visibility", () => {
    const f = fixture();
    f.branch.protected = false;
    f.repo.id = 999;
    f.repo.owner.id = 999;
    f.repo.private = false;
    const report = run(f);
    expect(status(report, "branch-protected")).toBe("missing");
    expect(status(report, "repository-identity")).toBe("missing");
    expect(report.status).toBe("blocked");
  });

  it("rejects a main SHA that advances during the read", () => {
    const f = fixture();
    let reads = 0;
    const read = (path: string) => {
      if (path.endsWith("/branches/main") && ++reads > 1) {
        return { ...f.branch, commit: { sha: "b".repeat(40) } };
      }
      return f.read(path);
    };
    const report = auditRepositorySettings(target, policy, read);
    expect(status(report, "reviewed-main-sha")).toBe("missing");
    expect(report.status).toBe("blocked");
  });

  it("rejects changed rules but tolerates irrelevant response ordering", () => {
    const f = fixture();
    let reads = 0;
    const changingRead = (path: string) =>
      path === rulesPath && ++reads > 1 ? f.rules.slice(1) : f.read(path);
    expect(auditRepositorySettings(target, policy, changingRead).status).toBe(
      "blocked",
    );
    reads = 0;
    const reverse = (path: string) =>
      path === rulesPath && ++reads > 1 ? [...f.rules].reverse() : f.read(path);
    expect(auditRepositorySettings(target, policy, reverse).status).toBe(
      "enforced",
    );
  });

  it("reports inaccessible metadata as unverified without leaking raw error text", () => {
    const f = fixture();
    const report = auditRepositorySettings(target, policy, (path) => {
      if (path === rulesPath) throw new GitHubReadError(403);
      if (path === base) throw new Error("token=DO_NOT_LOG_THIS");
      return f.read(path);
    });
    expect(report.status).toBe("blocked");
    expect(status(report, "required-check:Required CI")).toBe("unverified");
    expect(report.observations.some((read) => read.httpStatus === 403)).toBe(
      true,
    );
    expect(JSON.stringify(report)).not.toContain("DO_NOT_LOG_THIS");
  });

  it("rejects malformed rules and refuses partial evidence over the detail bound", () => {
    const f = fixture();
    f.responses.set(rulesPath, [
      { type: "merge_queue", ruleset_id: "../wrong" },
    ]);
    expect(run(f).status).toBe("blocked");
    f.responses.set(
      rulesPath,
      Array.from({ length: 31 }, (_, id) => ({
        ...f.rules[0],
        ruleset_id: id + 1,
      })),
    );
    expect(run(f).status).toBe("blocked");
    expect(
      f.read.mock.calls.some(([path]) => path.includes("/rulesets/")),
    ).toBe(false);
  });

  it("rejects incomplete policy and unsafe input before any network read", () => {
    const f = fixture();
    expect(() =>
      auditRepositorySettings(
        { ...target, expectedSha: "main" },
        policy,
        f.read,
      ),
    ).toThrow();
    expect(() =>
      auditRepositorySettings(
        { ...target, repository: "../.." },
        policy,
        f.read,
      ),
    ).toThrow();
    expect(() =>
      auditRepositorySettings(
        target,
        { ...policy, requiredChecks: [] },
        f.read,
      ),
    ).toThrow();
    expect(f.read).not.toHaveBeenCalled();
    expect(parseArguments(["--expected-sha", sha])).toBe(sha);
    for (const args of [
      [],
      ["--apply"],
      ["--expected-sha", sha, "--apply"],
      ["--expected-sha", "main"],
    ]) {
      expect(() => parseArguments(args)).toThrow();
    }
  });
});

describe("GitHub transport", () => {
  it("pins GET and github.com and combines every paginated array", () => {
    const execute = vi
      .fn<CommandRunner>()
      .mockReturnValue('[[{"type":"first"}],[{"type":"last"}]]');
    expect(githubGet(rulesPath, true, execute)).toEqual([
      { type: "first" },
      { type: "last" },
    ]);
    const [binary, args, options] = execute.mock.calls[0];
    expect(binary).toBe("gh");
    expect(args).toEqual([
      "api",
      "--hostname",
      "github.com",
      "--method",
      "GET",
      "--header",
      "Accept: application/vnd.github+json",
      "--header",
      "X-GitHub-Api-Version: 2022-11-28",
      "--paginate",
      "--slurp",
      rulesPath,
    ]);
    expect(options).toMatchObject({
      timeout: 30_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    expect(options).not.toHaveProperty("shell");
  });

  it("rejects malformed pages and sanitizes CLI errors including debug output", () => {
    const execute = vi
      .fn<CommandRunner>()
      .mockReturnValue('[{"not":"a page"}]');
    expect(() => githubGet(rulesPath, true, execute)).toThrow(GitHubReadError);
    execute.mockImplementation(() => {
      throw Object.assign(new Error("secret response"), {
        stderr: "Authorization: secret (HTTP 403)",
      });
    });
    let captured: unknown;
    try {
      githubGet(rulesPath, false, execute);
    } catch (error) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(GitHubReadError);
    expect((captured as GitHubReadError).httpStatus).toBe(403);
    expect(String(captured)).not.toContain("secret");
  });
});
