import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

const registry = "us-east4-docker.pkg.dev/samra-pay-staging/samra-staging";
const operators = new Set([
  "me@davidhaile.com",
  "samra-github-staging@samra-pay-staging.iam.gserviceaccount.com",
]);
const images = [
  "samra-api",
  "samra-customer-web",
  "samra-operations-web",
  "samra-design-system-preview",
  "samra-migrations",
];
const accept = [
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.docker.distribution.manifest.v2+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
].join(", ");

export function readAccessToken(operator, execute = execFileSync) {
  if (!operators.has(operator)) {
    throw new Error("STOP: image review requires a reviewed staging operator");
  }
  try {
    const token = execute(
      "gcloud",
      ["auth", "print-access-token", `--account=${operator}`, "--quiet"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 30_000,
        maxBuffer: 4096,
      },
    ).trim();
    if (!token || token.length > 4096 || /\s/.test(token)) throw new Error();
    return token;
  } catch {
    // Never expose the credential command's output, stderr, or error object.
    throw new Error("STOP: unable to obtain the reviewed staging credential");
  }
}

async function absentResponse(response, image) {
  if (response.status === 200) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`STOP: immutable image tag already exists for ${image}`);
  }
  if (response.status !== 404) {
    await response.body?.cancel().catch(() => {});
    throw new Error(
      `STOP: image absence is unproved for ${image} (HTTP ${response.status})`,
    );
  }
  let bytes;
  let code;
  try {
    if (
      !/^application\/json(?:\s*;|$)/i.test(
        response.headers.get("content-type") ?? "",
      )
    ) {
      throw new Error();
    }
    const chunks = [];
    let length = 0;
    for await (const chunk of response.body) {
      length += chunk.byteLength;
      if (length > 16_384) throw new Error();
      chunks.push(chunk);
    }
    bytes = Buffer.concat(chunks);
    const body = JSON.parse(bytes.toString("utf8"));
    if (!Array.isArray(body.errors) || body.errors.length !== 1)
      throw new Error();
    code = body.errors[0]?.code;
    if (!["MANIFEST_UNKNOWN", "NAME_UNKNOWN"].includes(code)) throw new Error();
  } catch {
    throw new Error(
      `STOP: image absence is unproved for ${image} (ambiguous registry response)`,
    );
  }
  return {
    image,
    status: "absent",
    httpStatus: 404,
    errorCode: code,
    responseSha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export async function verifyStagingImageAbsence(
  { candidateSha, operator },
  { getAccessToken = readAccessToken, fetchImpl = fetch } = {},
) {
  if (!/^[a-f0-9]{40}$/.test(candidateSha ?? "") || !operators.has(operator)) {
    throw new Error(
      "STOP: exact source and reviewed staging operator are required",
    );
  }
  let token;
  try {
    token = getAccessToken(operator);
    if (
      typeof token !== "string" ||
      !token ||
      token.length > 4096 ||
      /\s/.test(token)
    ) {
      throw new Error();
    }
  } catch {
    throw new Error("STOP: unable to obtain the reviewed staging credential");
  }
  const checked = [];
  for (const image of images) {
    const url = `https://us-east4-docker.pkg.dev/v2/samra-pay-staging/samra-staging/${image}/manifests/${candidateSha}`;
    let response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: { authorization: `Bearer ${token}`, accept },
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new Error(
        `STOP: image absence is unproved for ${image} (registry request failed)`,
      );
    }
    checked.push(await absentResponse(response, image));
  }
  return {
    schemaVersion: 1,
    candidateSha,
    registry,
    operator,
    checkedAt: new Date().toISOString(),
    images: checked,
    cloudMutationPerformed: false,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const { values } = parseArgs({
      options: {
        "candidate-sha": { type: "string" },
        operator: { type: "string" },
      },
    });
    console.log(
      JSON.stringify(
        await verifyStagingImageAbsence({
          candidateSha: values["candidate-sha"],
          operator: values.operator,
        }),
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(
      error.message.startsWith("STOP:")
        ? error.message
        : "STOP: staging image absence review failed",
    );
    process.exitCode = 1;
  }
}
