import { pathToFileURL } from "node:url";

const FULL_GIT_SHA = /^[0-9a-f]{40}$/;
const PROJECT_ID = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const REGION = /^[a-z]+-[a-z]+[0-9]$/;

function required(input, key) {
  const value = input[key]?.trim();
  if (!value || value === "unset") {
    throw new Error(`${key} is required and cannot use the unset default`);
  }
  return value;
}

export function validateBuildInputs(input) {
  const environment = required(input, "SAMRA_BUILD_ENVIRONMENT");
  const expectedServiceAccount = required(
    input,
    "SAMRA_BUILD_EXPECTED_SERVICE_ACCOUNT",
  );
  const imageTag = required(input, "SAMRA_BUILD_IMAGE_TAG");
  const projectId = required(input, "SAMRA_BUILD_PROJECT_ID");
  const region = required(input, "SAMRA_BUILD_REGION");
  const repository = required(input, "SAMRA_BUILD_REPOSITORY");
  const sourceSha = required(input, "SAMRA_BUILD_SOURCE_SHA");

  if (environment !== "staging") {
    throw new Error("Only the staging Cloud Build contract is permitted");
  }
  if (!PROJECT_ID.test(projectId) || !/(?:^|-)staging(?:-|$)/.test(projectId)) {
    throw new Error(
      "SAMRA_BUILD_PROJECT_ID must be a valid, dedicated staging project ID",
    );
  }
  if (!REGION.test(region)) {
    throw new Error("SAMRA_BUILD_REGION must be an explicit regional location");
  }
  if (repository !== "samra-staging") {
    throw new Error("SAMRA_BUILD_REPOSITORY must be samra-staging");
  }
  if (!FULL_GIT_SHA.test(sourceSha)) {
    throw new Error("SAMRA_BUILD_SOURCE_SHA must be a full lowercase Git SHA");
  }
  if (!FULL_GIT_SHA.test(imageTag)) {
    throw new Error("SAMRA_BUILD_IMAGE_TAG must be a full lowercase Git SHA");
  }
  if (imageTag !== sourceSha) {
    throw new Error("The image tag must exactly match the source Git SHA");
  }

  const requiredServiceAccount = `samra-cloud-build-staging@${projectId}.iam.gserviceaccount.com`;
  if (expectedServiceAccount !== requiredServiceAccount) {
    throw new Error(
      `Cloud Build must use the dedicated service account ${requiredServiceAccount}`,
    );
  }

  return {
    schemaVersion: 1,
    status: "validated",
    environment,
    projectId,
    region,
    repository,
    sourceSha,
    imageTag,
    serviceAccount: expectedServiceAccount,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    console.log(JSON.stringify(validateBuildInputs(process.env)));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Cloud Build input contract rejected: ${message}`);
    process.exitCode = 1;
  }
}
