import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const PROJECT_ID = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const ORGANIZATION_ID = /^[0-9]+$/;
const REGION = /^[a-z]+-[a-z]+[0-9]$/;
const SERVICE_ACCOUNT_ID = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const API = /^[a-z0-9.-]+\.googleapis\.com$/;
const FIREBASE_MANAGED_SERVICE_ACCOUNT_PATTERNS = [
  "service-${PROJECT_NUMBER}@gcp-sa-firebase.iam.gserviceaccount.com",
  "firebase-adminsdk-${RANDOM5}@${PROJECT_ID}.iam.gserviceaccount.com",
];
const FIREBASE_MANAGED_APIS = [
  "appengine.googleapis.com",
  "pubsub.googleapis.com",
  "cloudresourcemanager.googleapis.com",
  "runtimeconfig.googleapis.com",
  "testing.googleapis.com",
  "fcm.googleapis.com",
  "firebasedynamiclinks.googleapis.com",
  "firebasehosting.googleapis.com",
  "firebaseinstallations.googleapis.com",
  "firebase.googleapis.com",
  "firebaseremoteconfig.googleapis.com",
  "firebaseremoteconfigrealtime.googleapis.com",
  "firebaserules.googleapis.com",
  "identitytoolkit.googleapis.com",
  "securetoken.googleapis.com",
];

export function readStagingFoundation() {
  return JSON.parse(
    readFileSync(new URL("./staging-foundation.json", import.meta.url), "utf8"),
  );
}

export function validateStagingFoundation(
  foundation = readStagingFoundation(),
) {
  if (foundation.schemaVersion !== 1) {
    throw new Error("Unsupported staging foundation schema");
  }
  if (
    foundation.status !== "review-only" ||
    foundation.environment !== "staging" ||
    foundation.dataClassification !== "synthetic-only"
  ) {
    throw new Error("The foundation must remain review-only synthetic staging");
  }

  const { project } = foundation;
  if (
    !PROJECT_ID.test(project.id) ||
    !/(?:^|-)staging(?:-|$)/.test(project.id)
  ) {
    throw new Error("The project ID must be a dedicated staging project");
  }
  if (!ORGANIZATION_ID.test(project.organizationId)) {
    throw new Error("A numeric Google Cloud organization ID is required");
  }
  if (!REGION.test(project.region)) {
    throw new Error("An explicit Google Cloud region is required");
  }
  if (project.billingRequired !== true) {
    throw new Error("Billing must be verified before foundation apply");
  }
  if (
    !Number.isInteger(project.budgetAlertUsd) ||
    project.budgetAlertUsd < 10 ||
    project.budgetAlertUsd > 100
  ) {
    throw new Error("The staging budget alert must be between $10 and $100");
  }

  if (
    foundation.firebase.addToExistingProject !== true ||
    foundation.firebase.additionFullyReversible !== false ||
    foundation.firebase.googleAnalyticsEnabled !== false ||
    foundation.firebase.geminiInFirebaseEnabled !== false ||
    foundation.firebase.authenticationEnabled !== false ||
    foundation.firebase.firestoreEnabled !== false ||
    foundation.firebase.hostingEnabled !== false ||
    foundation.firebase.appRegistrationBlockedUntilIdentifiersAreLocked !== true
  ) {
    throw new Error("Firebase must remain a bounded existing-project add-on");
  }

  const firebaseEffects = foundation.firebase.providerManagedEffects;
  if (
    firebaseEffects?.firebaseEnabledLabel !== true ||
    firebaseEffects?.browserApiKey !== "auto-created-and-api-restricted" ||
    JSON.stringify(firebaseEffects.serviceAccountPatterns) !==
      JSON.stringify(FIREBASE_MANAGED_SERVICE_ACCOUNT_PATTERNS) ||
    JSON.stringify(firebaseEffects.apis) !==
      JSON.stringify(FIREBASE_MANAGED_APIS)
  ) {
    throw new Error("Firebase provider-managed effects must remain explicit");
  }

  const apis = foundation.samraManagedApis;
  if (!Array.isArray(apis) || apis.length === 0) {
    throw new Error("An explicit Samra-managed API allowlist is required");
  }
  if (
    new Set(apis).size !== apis.length ||
    apis.some((api) => !API.test(api))
  ) {
    throw new Error(
      "The Samra-managed API allowlist contains an invalid or duplicate value",
    );
  }

  const accounts = Object.values(foundation.serviceAccounts);
  if (
    new Set(accounts).size !== accounts.length ||
    accounts.some((account) => !SERVICE_ACCOUNT_ID.test(account))
  ) {
    throw new Error("Every trust boundary needs a distinct service account");
  }

  const permittedProjectRoles = new Set([
    "roles/logging.logWriter",
    "roles/serviceusage.serviceUsageConsumer",
    "roles/run.admin",
    "roles/cloudsql.client",
  ]);
  for (const [boundary, roles] of Object.entries(
    foundation.projectRoleBindings,
  )) {
    if (!foundation.serviceAccounts[boundary]) {
      throw new Error(`Unknown role-binding boundary: ${boundary}`);
    }
    if (
      !Array.isArray(roles) ||
      roles.some((role) => !permittedProjectRoles.has(role))
    ) {
      throw new Error(`Over-broad project role requested for ${boundary}`);
    }
  }

  if (
    foundation.artifactRegistry.repository !== "samra-staging" ||
    foundation.artifactRegistry.format !== "docker" ||
    foundation.artifactRegistry.immutableTags !== true
  ) {
    throw new Error("Artifact Registry must use immutable staging Docker tags");
  }
  if (
    foundation.secret.id !== "samra-staging-database-url" ||
    foundation.secret.replication !== "regional" ||
    foundation.secret.createVersion !== false
  ) {
    throw new Error("The foundation may create secret metadata but no value");
  }

  return Object.freeze({
    schemaVersion: foundation.schemaVersion,
    status: "validated",
    projectId: project.id,
    organizationId: project.organizationId,
    region: project.region,
    repository: foundation.artifactRegistry.repository,
    budgetAlertUsd: project.budgetAlertUsd,
    samraManagedApiCount: apis.length,
    firebaseManagedApiCount: firebaseEffects.apis.length,
    samraServiceAccountCount: accounts.length,
    firebaseManagedServiceAccountPatternCount:
      firebaseEffects.serviceAccountPatterns.length,
  });
}

export function validateFoundationEnvironment(
  input,
  foundation = readStagingFoundation(),
) {
  const validated = validateStagingFoundation(foundation);
  const required = {
    SAMRA_GCP_PROJECT_ID: validated.projectId,
    SAMRA_GCP_ORGANIZATION_ID: validated.organizationId,
    SAMRA_GCP_REGION: validated.region,
  };
  for (const [key, expected] of Object.entries(required)) {
    if (input[key]?.trim() !== expected) {
      throw new Error(
        `${key} must exactly match the reviewed value ${expected}`,
      );
    }
  }
  const operator = input.SAMRA_GCP_OPERATOR_ACCOUNT?.trim();
  if (!operator || !/^[^@\s]+@davidhaile\.com$/.test(operator)) {
    throw new Error(
      "SAMRA_GCP_OPERATOR_ACCOUNT must be a davidhaile.com administrator",
    );
  }
  return Object.freeze({ ...validated, operator });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    console.log(JSON.stringify(validateFoundationEnvironment(process.env)));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Staging foundation rejected: ${message}`);
    process.exitCode = 1;
  }
}
