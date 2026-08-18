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
  verifyManifest,
  writeManifestAndHash,
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
  version: 1,
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

describe("release evidence", () => {
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
      gateResults: { identity: "success", quality: "success" },
      qaseRunId: "9",
      qaseRunUrl: "https://qase.test/9",
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
      schemaVersion: 1 as const,
      releaseId: identity.releaseId,
      candidateSha: identity.candidateSha,
      gitTreeSha: identity.gitTreeSha,
      parentShas: identity.parentShas,
      repository: identity.repository,
      workflowRunId: identity.workflowRunId,
      workflowRunAttempt: 1,
      workflowRunUrl: identity.workflowRunUrl,
      qaseEnvironment: "github-ci-postgres",
      qaseRunId: "9",
      qaseRunUrl: "https://qase.test/9",
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

  it("rejects evidence changed after the manifest was written", async () => {
    const root = await mkdtemp(join(tmpdir(), "samra-release-files-"));
    await mkdir(join(root, "evidence"), { recursive: true });
    await writeFile(join(root, "evidence/one.xml"), "<testsuite/>\n", "utf8");
    await writeFile(join(root, "evidence/two.json"), "{}\n", "utf8");
    const manifest = await createReleaseEvidenceManifest({
      workspaceRoot: root,
      contract,
      identity,
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
