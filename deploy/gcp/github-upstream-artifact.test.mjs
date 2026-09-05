import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  UPSTREAM_ARTIFACT_CONTRACTS,
  githubArtifactOutputs,
  validateGitHubUpstreamArtifactMetadata,
  validateGitHubUpstreamRunMetadata,
  verifyGitHubUpstreamArtifact,
} from "./verify-github-upstream-artifact.mjs";

const candidateSha = "a".repeat(40);
const runId = "32608456303";
const runAttempt = 2;
const artifactId = 7_654_321;
const repository = {
  id: 1_335_175_962,
  full_name: "haileleuld87/Samra-Pay",
  owner: { id: 237_485_986 },
};

function input(overrides = {}) {
  return {
    kind: "staging-zero-traffic-deployment",
    service: "samra-api",
    candidateSha,
    runId,
    runAttempt,
    artifactName: `staging-zero-traffic-samra-api-${candidateSha}-run-${runId}-attempt-${runAttempt}`,
    ...overrides,
  };
}

function runMetadata(overrides = {}) {
  return {
    id: Number(runId),
    run_attempt: runAttempt,
    name: "Staging zero-traffic deployment",
    path: ".github/workflows/staging-zero-traffic-deployment.yml",
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: candidateSha,
    status: "completed",
    conclusion: "success",
    html_url: `https://github.com/haileleuld87/Samra-Pay/actions/runs/${runId}`,
    repository,
    head_repository: repository,
    ...overrides,
  };
}

function artifactListing(overrides = {}) {
  const artifact = {
    id: artifactId,
    name: input().artifactName,
    size_in_bytes: 4096,
    url: `https://api.github.com/repos/haileleuld87/Samra-Pay/actions/artifacts/${artifactId}`,
    archive_download_url: `https://api.github.com/repos/haileleuld87/Samra-Pay/actions/artifacts/${artifactId}/zip`,
    expired: false,
    digest: `sha256:${"b".repeat(64)}`,
    workflow_run: {
      id: Number(runId),
      repository_id: 1_335_175_962,
      head_repository_id: 1_335_175_962,
      head_branch: "main",
      head_sha: candidateSha,
    },
    ...overrides,
  };
  return { total_count: 1, artifacts: [artifact] };
}

test("governs every accepted upstream workflow and canonical artifact name", () => {
  assert.deepEqual(Object.keys(UPSTREAM_ARTIFACT_CONTRACTS), [
    "staging-migration",
    "staging-image-publication",
    "staging-zero-traffic-deployment",
    "staging-image-verification",
    "staging-verification",
    "staging-traffic-promotion",
  ]);
  assert.doesNotThrow(() =>
    validateGitHubUpstreamRunMetadata(runMetadata(), input()),
  );
  assert.throws(
    () =>
      validateGitHubUpstreamRunMetadata(
        runMetadata(),
        input({ artifactName: "operator-selected-artifact" }),
      ),
    /artifact name does not match the governed identity/,
  );
  assert.throws(
    () =>
      validateGitHubUpstreamRunMetadata(
        runMetadata(),
        input({ kind: "operator-migration" }),
      ),
    /Unsupported upstream artifact kind/,
  );
});

test("accepts one successful exact-main run and one exact immutable artifact", async () => {
  const result = await verifyGitHubUpstreamArtifact({
    ...input(),
    runMetadata: runMetadata(),
    artifactListing: artifactListing(),
  });
  assert.equal(
    result.workflowRef,
    "haileleuld87/Samra-Pay/.github/workflows/staging-zero-traffic-deployment.yml@refs/heads/main",
  );
  assert.equal(result.artifact.id, String(artifactId));
  assert.equal(result.artifact.name, input().artifactName);
  assert.equal(result.artifact.expired, false);
});

test("allows only the traffic promotion controller to differ from its release candidate", async () => {
  const controllerSha = "c".repeat(40);
  const promotionInput = input({
    kind: "staging-traffic-promotion",
    artifactName: `staging-traffic-promotion-samra-api-${candidateSha}-run-${runId}-attempt-${runAttempt}`,
  });
  const result = await verifyGitHubUpstreamArtifact({
    ...promotionInput,
    runMetadata: runMetadata({
      name: "Staging traffic control",
      path: ".github/workflows/staging-traffic-control.yml",
      head_sha: controllerSha,
    }),
    artifactListing: artifactListing({
      name: promotionInput.artifactName,
      workflow_run: {
        ...artifactListing().artifacts[0].workflow_run,
        head_sha: controllerSha,
      },
    }),
    expectedControllerSha: controllerSha,
    expectedArtifactId: String(artifactId),
  });
  assert.equal(result.candidateSha, candidateSha);
  assert.equal(result.controllerSha, controllerSha);
});

test("emits only allowlisted output keys and validated single-line immutable identities", async () => {
  const result = await verifyGitHubUpstreamArtifact({
    ...input(),
    runMetadata: runMetadata(),
    artifactListing: artifactListing(),
  });
  assert.equal(
    githubArtifactOutputs(result, "zero_traffic"),
    `zero_traffic_artifact_id=${artifactId}\nzero_traffic_artifact_digest=sha256:${"b".repeat(64)}\nzero_traffic_controller_sha=${candidateSha}\n`,
  );
  for (const prefix of [
    "promotion",
    "__proto__",
    "zero_traffic\ninjected",
    "arbitrary",
  ]) {
    assert.throws(
      () => githubArtifactOutputs(result, prefix),
      /allowlisted artifact kind/,
    );
  }
  assert.throws(
    () =>
      githubArtifactOutputs(
        { ...result, artifact: { ...result.artifact, id: "7\ninjected=true" } },
        "zero_traffic",
      ),
    /positive integer/,
  );
  assert.throws(
    () =>
      githubArtifactOutputs(
        {
          ...result,
          artifact: {
            ...result.artifact,
            digest: `${result.artifact.digest}\ninjected=true`,
          },
        },
        "zero_traffic",
      ),
    /immutable SHA-256/,
  );
});

test("rejects changed artifact or controller identities after download selection", async () => {
  const options = {
    ...input(),
    runMetadata: runMetadata(),
    artifactListing: artifactListing(),
  };
  await assert.rejects(
    verifyGitHubUpstreamArtifact({ ...options, expectedArtifactId: "1" }),
    /artifact ID changed/,
  );
  await assert.rejects(
    verifyGitHubUpstreamArtifact({
      ...options,
      expectedControllerSha: "c".repeat(40),
    }),
    /controller SHA changed/,
  );
  await assert.rejects(
    verifyGitHubUpstreamArtifact({
      ...options,
      promotionManifestPath: "missing.json",
    }),
    /supplied together/,
  );
});

test("bounds both GitHub metadata requests with abort deadlines", async (context) => {
  let calls = 0;
  context.mock.method(globalThis, "fetch", async (_endpoint, options) => {
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.signal.aborted, false);
    calls += 1;
    return {
      ok: true,
      json: async () => (calls === 1 ? runMetadata() : artifactListing()),
    };
  });
  await verifyGitHubUpstreamArtifact({
    ...input(),
    token: "synthetic-test-token",
  });
  assert.equal(calls, 2);
});

test("rejects run identity, source, attempt, event, or result drift", () => {
  for (const mutation of [
    { id: Number(runId) + 1 },
    { run_attempt: runAttempt + 1 },
    { name: "Decoy workflow" },
    { path: ".github/workflows/decoy.yml" },
    { event: "pull_request" },
    { head_branch: "feature" },
    { head_sha: "c".repeat(40) },
    { status: "in_progress" },
    { conclusion: "failure" },
    { html_url: "https://github.com/haileleuld87/Samra-Pay/actions/runs/1" },
    { repository: { ...repository, id: 1 } },
    { repository: { ...repository, owner: { id: 1 } } },
    { head_repository: { ...repository, full_name: "attacker/fork" } },
    { head_repository: { ...repository, owner: { id: 1 } } },
  ]) {
    assert.throws(
      () => validateGitHubUpstreamRunMetadata(runMetadata(mutation), input()),
      /workflow run identity or result drifted/,
    );
  }
});

test("rejects missing, duplicate, expired, mutable, or cross-run artifact metadata", () => {
  const run = validateGitHubUpstreamRunMetadata(runMetadata(), input());
  const mutations = [
    { total_count: 0, artifacts: [] },
    {
      total_count: 2,
      artifacts: [
        artifactListing().artifacts[0],
        artifactListing().artifacts[0],
      ],
    },
    artifactListing({ name: "decoy" }),
    artifactListing({ expired: true }),
    artifactListing({ size_in_bytes: 0 }),
    artifactListing({ digest: null }),
    artifactListing({
      url: "https://api.github.com/repos/attacker/repo/actions/artifacts/7654321",
    }),
    artifactListing({
      workflow_run: { ...artifactListing().artifacts[0].workflow_run, id: 1 },
    }),
    artifactListing({
      workflow_run: {
        ...artifactListing().artifacts[0].workflow_run,
        repository_id: 1,
      },
    }),
    artifactListing({
      workflow_run: {
        ...artifactListing().artifacts[0].workflow_run,
        head_sha: "c".repeat(40),
      },
    }),
  ];
  for (const mutation of mutations) {
    assert.throws(
      () => validateGitHubUpstreamArtifactMetadata(mutation, run),
      /one exact named artifact|artifact identity drifted/,
    );
  }
});

test("requires service identity exactly where artifact naming uses it", () => {
  assert.throws(
    () =>
      validateGitHubUpstreamRunMetadata(runMetadata(), input({ service: "" })),
    /service is not allowlisted/,
  );
  assert.throws(
    () =>
      validateGitHubUpstreamRunMetadata(
        runMetadata({
          name: "Staging image verification",
          path: ".github/workflows/staging-image-verification.yml",
        }),
        input({
          kind: "staging-image-verification",
          service: "samra-api",
          artifactName: `staging-image-verification-${candidateSha}-run-${runId}-attempt-${runAttempt}`,
        }),
      ),
    /does not take a service/,
  );
});

test("all privileged downstream workflows verify GitHub provenance before cloud authentication", async () => {
  const workflows = Object.fromEntries(
    await Promise.all(
      [
        "staging-zero-traffic-deployment.yml",
        "staging-image-verification.yml",
        "staging-verification-probe.yml",
        "staging-traffic-control.yml",
      ].map(async (name) => [
        name,
        await readFile(
          new URL(`../../.github/workflows/${name}`, import.meta.url),
          "utf8",
        ),
      ]),
    ),
  );
  for (const [name, workflow] of Object.entries(workflows)) {
    const verifier = workflow.indexOf("verify-github-upstream-artifact.mjs");
    const authentication = workflow.indexOf("google-github-actions/auth@");
    assert.ok(verifier > 0, `${name} must invoke the upstream verifier`);
    assert.ok(
      verifier < authentication,
      `${name} must verify upstream GitHub evidence before cloud authentication`,
    );
    assert.match(
      workflow,
      /permissions:\n  contents: read\n  actions: read\n  id-token: write/,
    );
    for (const step of workflow.split(/\n      - name: /)) {
      if (!step.includes("uses: actions/download-artifact@")) continue;
      const output = step.match(
        /artifact-ids: \$\{\{ steps\.verify_upstream\.outputs\.([a-z_]+)_artifact_id \}\}/,
      );
      assert.ok(
        output,
        `${name} must download the verifier-selected immutable artifact ID`,
      );
      assert.ok(
        workflow.includes(`--output-prefix ${output[1]}`),
        `${name} must emit its selected artifact output`,
      );
      assert.doesNotMatch(step, /\n          (?:name|pattern):/);
      assert.match(step, /digest-mismatch: error/);
    }
  }

  assert.match(
    workflows["staging-zero-traffic-deployment.yml"],
    /verify-staging-migration-prerequisite\.mjs/,
  );
  assert.match(
    workflows["staging-zero-traffic-deployment.yml"],
    /prerequisite_run_attempt:/,
  );
  assert.match(
    workflows["staging-zero-traffic-deployment.yml"],
    /--kind staging-image-publication[\s\S]*--kind staging-zero-traffic-deployment/,
  );
  assert.match(
    workflows["staging-image-verification.yml"],
    /--kind staging-zero-traffic-deployment[\s\S]*--service samra-api/,
  );
  assert.match(
    workflows["staging-verification-probe.yml"],
    /--kind staging-zero-traffic-deployment[\s\S]*--kind staging-image-verification/,
  );
  assert.match(
    workflows["staging-traffic-control.yml"],
    /zero_traffic_run_attempt:[\s\S]*verification_run_attempt:[\s\S]*promotion_run_attempt:/,
  );
  assert.match(
    workflows["staging-traffic-control.yml"],
    /--kind staging-zero-traffic-deployment[\s\S]*--kind staging-verification[\s\S]*--kind staging-traffic-promotion/,
  );
  const trafficWorkflow = workflows["staging-traffic-control.yml"];
  const binding = trafficWorkflow.indexOf(
    "Bind downloaded promotion to its verified controller and run",
  );
  assert.ok(
    binding > trafficWorkflow.indexOf("Download immutable promotion evidence"),
  );
  assert.ok(binding < trafficWorkflow.indexOf("google-github-actions/auth@"));
  assert.match(
    trafficWorkflow,
    /git merge-base --is-ancestor "\$\{SAMRA_STAGING_CANDIDATE_SHA\}" "\$\{SAMRA_VERIFIED_PROMOTION_CONTROLLER_SHA\}"/,
  );
  assert.match(
    trafficWorkflow,
    /--expected-artifact-id[\s\S]*--expected-controller-sha[\s\S]*--promotion-manifest[\s\S]*--promotion-hash/,
  );
});
