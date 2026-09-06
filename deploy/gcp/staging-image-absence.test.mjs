import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  readAccessToken,
  verifyStagingImageAbsence,
} from "./verify-staging-image-absence.mjs";

const candidateSha = "a".repeat(40);
const operator =
  "samra-github-staging@samra-pay-staging.iam.gserviceaccount.com";
const token = "synthetic-token-never-log";
const input = { candidateSha, operator };
const absence = (code = "MANIFEST_UNKNOWN") =>
  JSON.stringify({ errors: [{ code, message: "Synthetic fixture" }] });
const response = (
  status = 404,
  body = absence(),
  contentType = "application/json",
) => new Response(body, { status, headers: { "content-type": contentType } });

test("accepts only explicit absence for all five exact-SHA images on the fixed staging registry", async () => {
  const calls = [];
  const result = await verifyStagingImageAbsence(input, {
    getAccessToken: (account) => {
      assert.equal(account, operator);
      return token;
    },
    fetchImpl: async (url, options) => {
      calls.push(url);
      assert.equal(options.method, "GET");
      assert.equal(options.redirect, "error");
      assert.equal(options.headers.authorization, `Bearer ${token}`);
      assert.ok(options.signal instanceof AbortSignal);
      assert.match(
        options.headers.accept,
        /application\/vnd\.oci\.image\.index\.v1\+json/,
      );
      return response();
    },
  });
  assert.deepEqual(
    calls,
    [
      "samra-api",
      "samra-customer-web",
      "samra-operations-web",
      "samra-design-system-preview",
      "samra-migrations",
    ].map(
      (image) =>
        `https://us-east4-docker.pkg.dev/v2/samra-pay-staging/samra-staging/${image}/manifests/${candidateSha}`,
    ),
  );
  assert.equal(result.images.length, 5);
  assert.equal(result.cloudMutationPerformed, false);
  assert.equal(result.candidateSha, candidateSha);
  for (const image of result.images) {
    assert.equal(image.httpStatus, 404);
    assert.equal(image.errorCode, "MANIFEST_UNKNOWN");
    assert.equal(
      image.responseSha256,
      createHash("sha256").update(absence()).digest("hex"),
    );
  }
  assert.doesNotMatch(
    JSON.stringify(result),
    /synthetic-token|Synthetic fixture/,
  );
});

test("accepts an explicitly unknown image name after the controller verifies the registry", async () => {
  const result = await verifyStagingImageAbsence(input, {
    getAccessToken: () => token,
    fetchImpl: async () => response(404, absence("NAME_UNKNOWN")),
  });
  assert.ok(result.images.every((image) => image.errorCode === "NAME_UNKNOWN"));
});

for (const status of [
  200, 301, 302, 307, 308, 400, 401, 403, 408, 429, 500, 502, 503, 504,
]) {
  test(`blocks HTTP ${status} even if its body claims the manifest is absent`, async () => {
    let calls = 0;
    await assert.rejects(
      verifyStagingImageAbsence(input, {
        getAccessToken: () => token,
        fetchImpl: async () => {
          calls++;
          return response(status);
        },
      }),
      status === 200
        ? /immutable image tag already exists/
        : new RegExp(`HTTP ${status}`),
    );
    assert.equal(calls, 1);
  });
}

for (const body of [
  "",
  "not JSON",
  "null",
  "{}",
  '{"errors":[]}',
  absence("DENIED"),
  absence("UNAUTHORIZED"),
  absence("UNKNOWN"),
  '{"errors":[{"code":"MANIFEST_UNKNOWN"},{"code":"DENIED"}]}',
  JSON.stringify({ error: { status: "NOT_FOUND", code: 404 } }),
  JSON.stringify({
    errors: [{ code: "MANIFEST_UNKNOWN", message: "x".repeat(16_384) }],
  }),
]) {
  test(`blocks malformed or ambiguous 404 response ${createHash("sha256").update(body).digest("hex").slice(0, 8)}`, async () => {
    await assert.rejects(
      verifyStagingImageAbsence(input, {
        getAccessToken: () => token,
        fetchImpl: async () => response(404, body),
      }),
      /ambiguous registry response/,
    );
  });
}

test("rejects an HTML 404 and never emits response bodies", async () => {
  await assert.rejects(
    verifyStagingImageAbsence(input, {
      getAccessToken: () => token,
      fetchImpl: async () =>
        response(404, `<html>${token}</html>`, "text/html"),
    }),
    (error) => {
      assert.match(error.message, /ambiguous registry response/);
      assert.doesNotMatch(error.message, /synthetic-token|html/);
      return true;
    },
  );
});

test("a network or timeout failure stops at that image without retry or credential disclosure", async () => {
  let calls = 0;
  await assert.rejects(
    verifyStagingImageAbsence(input, {
      getAccessToken: () => token,
      fetchImpl: async () => {
        calls++;
        if (calls === 2) throw new Error(`Synthetic timeout ${token}`);
        return response();
      },
    }),
    (error) => {
      assert.match(
        error.message,
        /samra-customer-web \(registry request failed\)/,
      );
      assert.doesNotMatch(error.message, /synthetic-token/);
      return true;
    },
  );
  assert.equal(calls, 2);
});

test("a truncated 404 response cannot pass", async () => {
  await assert.rejects(
    verifyStagingImageAbsence(input, {
      getAccessToken: () => token,
      fetchImpl: async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new Error(token));
            },
          }),
          { status: 404, headers: { "content-type": "application/json" } },
        ),
    }),
    /ambiguous registry response/,
  );
});

test("rejects invalid source and identity before requesting a credential or registry metadata", async () => {
  for (const invalid of [
    { ...input, candidateSha: "main" },
    { ...input, candidateSha: "a".repeat(39) },
    { ...input, candidateSha: "../production" },
    { ...input, operator: "different@example.invalid" },
  ]) {
    await assert.rejects(
      verifyStagingImageAbsence(invalid, {
        getAccessToken: () => assert.fail("Credential boundary reached"),
        fetchImpl: () => assert.fail("Registry boundary reached"),
      }),
      /exact source and reviewed staging operator/,
    );
  }
});

test("uses only the named existing account and captures credential command outputs privately", () => {
  assert.equal(
    readAccessToken(operator, (command, args, options) => {
      assert.equal(command, "gcloud");
      assert.deepEqual(args, [
        "auth",
        "print-access-token",
        `--account=${operator}`,
        "--quiet",
      ]);
      assert.deepEqual(options.stdio, ["ignore", "pipe", "pipe"]);
      assert.equal(options.timeout, 30_000);
      assert.equal(options.maxBuffer, 4096);
      return `${token}\n`;
    }),
    token,
  );
});

test("credential failures and malformed outputs stop before HTTP without exposing subprocess output", async () => {
  assert.throws(
    () =>
      readAccessToken(operator, () => {
        throw Object.assign(new Error(token), { stdout: token, stderr: token });
      }),
    /^Error: STOP: unable to obtain the reviewed staging credential$/,
  );
  for (const invalid of ["", "line\nbreak", "a".repeat(4097)]) {
    assert.throws(
      () => readAccessToken(operator, () => invalid),
      /unable to obtain/,
    );
    await assert.rejects(
      verifyStagingImageAbsence(input, {
        getAccessToken: () => invalid,
        fetchImpl: () => assert.fail("Registry boundary reached"),
      }),
      /unable to obtain/,
    );
  }
  assert.throws(
    () =>
      readAccessToken("different@example.invalid", () =>
        assert.fail("Command boundary reached"),
      ),
    /reviewed staging operator/,
  );
});

test("CLI accepts explicit absence and rejects denied access using only synthetic credentials and HTTP fixtures", async (t) => {
  const folder = await mkdtemp(join(tmpdir(), "samra-image-absence-"));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const calls = join(folder, "calls.jsonl");
  const preload = join(folder, "registry-fixture.mjs");
  await writeFile(
    join(folder, "gcloud"),
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (JSON.stringify(args) !== JSON.stringify(${JSON.stringify(["auth", "print-access-token", `--account=${operator}`, "--quiet"])})) process.exit(99);
console.log(${JSON.stringify(token)});
`,
    { mode: 0o700 },
  );
  await writeFile(
    preload,
    `
import { appendFileSync } from 'node:fs';
globalThis.fetch = async (url, options) => {
  if (options.method !== 'GET' || options.redirect !== 'error') throw new Error('Unexpected request');
  if (options.headers.authorization !== ${JSON.stringify(`Bearer ${token}`)}) throw new Error('Unexpected fixture credential');
  appendFileSync(${JSON.stringify(calls)}, JSON.stringify({ url, method: options.method }) + '\\n');
  return new Response(${JSON.stringify(absence())}, { status: Number(process.env.SAMRA_TEST_REGISTRY_STATUS), headers: { 'content-type': 'application/json' } });
};
`,
  );
  for (const status of [404, 403]) {
    await writeFile(calls, "");
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        preload,
        "deploy/gcp/verify-staging-image-absence.mjs",
        "--candidate-sha",
        candidateSha,
        "--operator",
        operator,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${folder}:${process.env.PATH}`,
          SAMRA_TEST_REGISTRY_STATUS: String(status),
        },
      },
    );
    assert.equal(result.status, status === 404 ? 0 : 1);
    const requests = (await readFile(calls, "utf8"))
      .trim()
      .split("\n")
      .map(JSON.parse);
    assert.equal(requests.length, status === 404 ? 5 : 1);
    if (status === 404)
      assert.equal(JSON.parse(result.stdout).images.length, 5);
    else {
      assert.match(result.stderr, /HTTP 403/);
      assert.equal(result.stdout, "");
    }
    assert.doesNotMatch(result.stdout + result.stderr, /synthetic-token/);
  }
});
