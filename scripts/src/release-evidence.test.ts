import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildReleaseIdentity,
  createReleaseEvidenceManifest,
  createReleaseGateJunit,
  normalizeCandidateSha,
  splitReleaseEvidenceInvocation,
  verifyManifest,
  writeManifestAndHash,
  validateQaseReporting,
  type ReleaseEvidenceContract,
} from "./release-evidence";

const sha = "a".repeat(40);
const tree = "b".repeat(40);
const identity = buildReleaseIdentity({
  candidateSha: sha,
  gitTreeSha: tree,
  parentShas: ["c".repeat(40)],
  repository: "samra/test",
  workflowRunId: "123",
  workflowRunAttempt: 1,
  workflowRunUrl: "https://github.test/run/123",
  actor: "tester",
  eventName: "workflow_dispatch",
  mainAncestryVerified: true,
  generatedAt: "2026-08-18T00:00:00.000Z",
});

const contract: ReleaseEvidenceContract = {
  version: 2,
  qaseReporting: "optional",
  workflow: ".github/workflows/release-candidate.yml",
  manifest: "out/manifest.json",
  manifestHash: "out/manifest.sha256",
  retentionDays: 365,
  qaseEnvironment: "github-ci-postgres",
  requiredGates: [
    { id: "identity", title: "Candidate identity", includeInQase: true },
    { id: "quality", title: "Quality", includeInQase: true },
  ],
  requiredEvidenceFiles: ["evidence/one.xml", "evidence/two.json"],
  boundaries: ["synthetic only"],
};

const disabledReporting = {
  enabled: false,
  outcomes: {
    qase_create: "skipped",
    qase_upload: "skipped",
    qase_complete: "skipped",
  },
};

describe("release evidence", () => {
  it("accepts the pnpm argument separator used by GitHub Actions", () => {
    expect(
      splitReleaseEvidenceInvocation([
        "--",
        "identity",
        "--candidate-sha",
        sha,
      ]),
    ).toEqual({
      command: "identity",
      rawArguments: ["--candidate-sha", sha],
    });
    expect(
      splitReleaseEvidenceInvocation(["verify", "--require-passing"]),
    ).toEqual({
      command: "verify",
      rawArguments: ["--require-passing"],
    });
  });

  it("records disabled reporting and rejects fabricated external success", () => {
    expect(() =>
      validateQaseReporting(disabledReporting, null, null),
    ).not.toThrow();
    expect(() =>
      validateQaseReporting(
        {
          ...disabledReporting,
          outcomes: {
            ...disabledReporting.outcomes,
            qase_create: "success",
          },
        },
        null,
        null,
      ),
    ).toThrow(/inconsistent/);
    expect(() =>
      validateQaseReporting({ enabled: true, outcomes: {} }, null, null),
    ).toThrow(/invalid/);
  });

  it("accepts quota and upload failures only independently of engineering results", async () => {
    const root = await mkdtemp(join(tmpdir(), "samra-release-reporting-"));
    await mkdir(join(root, "evidence"), { recursive: true });
    await writeFile(join(root, "evidence/one.xml"), "<testsuite/>\n");
    await writeFile(join(root, "evidence/two.json"), "{}\n");
    for (const qase of [
      { qaseReporting: disabledReporting },
      {
        qaseReporting: {
          enabled: true,
          outcomes: {
            qase_create: "success",
            qase_upload: "skipped",
            qase_complete: "skipped",
          },
        },
      },
      {
        qaseReporting: {
          enabled: true,
          outcomes: {
            qase_create: "failure",
            qase_upload: "skipped",
            qase_complete: "skipped",
          },
        },
      },
      {
        qaseReporting: {
          enabled: true,
          outcomes: {
            qase_create: "success",
            qase_upload: "failure",
            qase_complete: "failure",
          },
        },
        qaseRunId: "9",
        qaseRunUrl: "https://app.qase.io/run/SAMP/dashboard/9",
      },
    ]) {
      for (const quality of [
        "success",
        "failure",
        "skipped",
        "cancelled",
        "missing",
      ]) {
        const manifest = await createReleaseEvidenceManifest({
          workspaceRoot: root,
          contract,
          identity,
          gateResults: { identity: "success", quality },
          ...qase,
          generatedAt: identity.generatedAt,
        });
        expect(manifest.overallStatus).toBe(
          quality === "success" ? "passed" : "failed",
        );
        const manifestPath = join(root, "manifest.json");
        const hashPath = join(root, "manifest.sha256");
        await writeManifestAndHash(
          { ...manifest, overallStatus: "passed" },
          manifestPath,
          hashPath,
        );
        if (quality !== "success") {
          await expect(
            verifyManifest(manifestPath, hashPath, true, root, contract),
          ).rejects.toThrow(/Release candidate failed/);
        } else {
          await expect(
            verifyManifest(manifestPath, hashPath, true, root, contract),
          ).resolves.toMatchObject({ overallStatus: "passed" });
        }
      }
    }
  });

  it("requires an exact full commit SHA", () => {
    expect(normalizeCandidateSha(` ${sha.toUpperCase()} `)).toBe(sha);
    expect(() => normalizeCandidateSha(sha.slice(0, 12))).toThrow(/exactly 40/);
  });

  it("derives the release identity from the immutable candidate SHA", () => {
    expect(identity.releaseId).toBe("rc-aaaaaaaaaaaa");
    expect(identity.shortSha).toBe("aaaaaaaaaaaa");
    expect(identity.mainAncestryVerified).toBe(true);
  });

  it("creates stable Qase gate cases and exposes failures", () => {
    const junit = createReleaseGateJunit(contract, identity, {
      identity: "success",
      quality: "failure",
    });
    expect(junit).toContain('tests="2" failures="1"');
    expect(junit).toContain('name="Quality"');
    expect(junit).toContain("Gate quality finished failure");
  });

  it("hashes every required evidence file and fails closed when one is absent", async () => {
    const root = await mkdtemp(join(tmpdir(), "samra-release-evidence-"));
    await mkdir(join(root, "evidence"), { recursive: true });
    await writeFile(join(root, "evidence/one.xml"), "<testsuite/>\n", "utf8");
    const failed = await createReleaseEvidenceManifest({
      workspaceRoot: root,
      contract,
      identity,
      qaseReporting: disabledReporting,
      gateResults: { identity: "success", quality: "success" },
      generatedAt: "2026-08-18T00:00:00.000Z",
    });
    expect(failed.overallStatus).toBe("failed");
    expect(failed.missingEvidenceFiles).toEqual(["evidence/two.json"]);

    await writeFile(join(root, "evidence/two.json"), "{}\n", "utf8");
    const passed = await createReleaseEvidenceManifest({
      workspaceRoot: root,
      contract,
      identity,
      qaseReporting: disabledReporting,
      gateResults: { identity: "success", quality: "success" },
      generatedAt: "2026-08-18T00:00:00.000Z",
    });
    expect(passed.overallStatus).toBe("passed");
    expect(passed.evidenceFiles).toHaveLength(2);
    expect(passed.evidenceFiles[0]!.sha256).toBe(
      createHash("sha256").update("<testsuite/>\n").digest("hex"),
    );
  });

  it("verifies the content-addressed manifest and rejects tampering", async () => {
    const root = await mkdtemp(join(tmpdir(), "samra-release-manifest-"));
    const manifestPath = join(root, "manifest.json");
    const hashPath = join(root, "manifest.sha256");
    const manifest = {
      schemaVersion: 2 as const,
      qaseReporting: disabledReporting,
      releaseId: identity.releaseId,
      candidateSha: identity.candidateSha,
      gitTreeSha: identity.gitTreeSha,
      parentShas: identity.parentShas,
      repository: identity.repository,
      workflowRunId: identity.workflowRunId,
      workflowRunAttempt: 1,
      workflowRunUrl: identity.workflowRunUrl,
      qaseEnvironment: "github-ci-postgres",
      qaseRunId: null,
      qaseRunUrl: null,
      gateResults: { identity: "success", quality: "success" },
      evidenceFiles: [],
      missingEvidenceFiles: [],
      overallStatus: "passed" as const,
      boundaries: ["synthetic only"],
      generatedAt: "2026-08-18T00:00:00.000Z",
    };
    await writeManifestAndHash(manifest, manifestPath, hashPath);
    await expect(verifyManifest(manifestPath, hashPath, true)).resolves.toEqual(
      manifest,
    );
    await writeFile(manifestPath, `${await readFile(manifestPath, "utf8")} `);
    await expect(verifyManifest(manifestPath, hashPath, true)).rejects.toThrow(
      /hash does not match/,
    );
  });

  it("validates a failed manifest against the contract before reporting missing evidence", async () => {
    const root = await mkdtemp(join(tmpdir(), "samra-release-missing-"));
    await mkdir(join(root, "evidence"), { recursive: true });
    await mkdir(join(root, "out"), { recursive: true });
    await writeFile(join(root, "evidence/one.xml"), "<testsuite/>\n", "utf8");
    const manifest = await createReleaseEvidenceManifest({
      workspaceRoot: root,
      contract,
      identity,
      qaseReporting: disabledReporting,
      gateResults: { identity: "success", quality: "failure" },
      generatedAt: "2026-08-18T00:00:00.000Z",
    });
    const manifestPath = join(root, contract.manifest);
    const hashPath = join(root, contract.manifestHash);
    await writeManifestAndHash(manifest, manifestPath, hashPath);

    await expect(
      verifyManifest(manifestPath, hashPath, false, root, contract),
    ).resolves.toEqual(manifest);
    await expect(
      verifyManifest(manifestPath, hashPath, true, root, contract),
    ).rejects.toThrow(
      /Release candidate failed: quality=failure; 1 evidence files missing/,
    );
  });

  it("rejects evidence changed after the manifest was written", async () => {
    const root = await mkdtemp(join(tmpdir(), "samra-release-files-"));
    await mkdir(join(root, "evidence"), { recursive: true });
    await writeFile(join(root, "evidence/one.xml"), "<testsuite/>\n", "utf8");
    await writeFile(join(root, "evidence/two.json"), "{}\n", "utf8");
    const manifest = await createReleaseEvidenceManifest({
      workspaceRoot: root,
      contract,
      identity,
      qaseReporting: disabledReporting,
      gateResults: { identity: "success", quality: "success" },
      generatedAt: "2026-08-18T00:00:00.000Z",
    });
    const manifestPath = join(root, contract.manifest);
    const hashPath = join(root, contract.manifestHash);
    await mkdir(join(root, "out"), { recursive: true });
    await writeManifestAndHash(manifest, manifestPath, hashPath);

    await expect(
      verifyManifest(manifestPath, hashPath, true, root, contract),
    ).resolves.toEqual(manifest);
    await writeFile(join(root, "evidence/one.xml"), "<changed/>\n", "utf8");
    await expect(
      verifyManifest(manifestPath, hashPath, true, root, contract),
    ).rejects.toThrow(/changed after hashing/);
  });
});
