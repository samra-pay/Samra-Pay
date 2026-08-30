import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  readComingSoonProductionFoundation,
  validateComingSoonProductionFoundation,
  validateProductionFoundationActivationEnvironment,
} from "./validate-coming-soon-production-foundation.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sorted(values) {
  return [...new Set(values)].sort();
}

function tail(resourceName) {
  return String(resourceName ?? "")
    .split("/")
    .at(-1);
}

function roleBindingsForMember(policy, member, boundary) {
  const bindings = (policy?.bindings ?? []).filter((binding) =>
    (binding.members ?? []).includes(member),
  );
  assert(
    bindings.every((binding) => !binding.condition),
    `${boundary} contains a conditional IAM binding`,
  );
  return sorted(bindings.map((binding) => binding.role));
}

function membersForRole(policy, role, boundary) {
  const bindings = (policy?.bindings ?? []).filter(
    (binding) => binding.role === role,
  );
  assert(
    bindings.every((binding) => !binding.condition),
    `${boundary} contains a conditional IAM binding`,
  );
  return sorted(bindings.flatMap((binding) => binding.members ?? []));
}

function rejectPublicIam(policy, boundary) {
  const publicMembers = (policy?.bindings ?? []).flatMap((binding) =>
    (binding.members ?? []).filter((member) =>
      ["allUsers", "allAuthenticatedUsers"].includes(member),
    ),
  );
  assert(publicMembers.length === 0, `${boundary} contains public IAM`);
}

function rejectUnexpectedBindings(policy, expectedByRole, boundary) {
  for (const binding of policy?.bindings ?? []) {
    assert(
      !binding.condition,
      `${boundary} contains a conditional IAM binding`,
    );
    const expectedMembers = expectedByRole[binding.role];
    assert(
      expectedMembers,
      `${boundary} has an unreviewed role: ${binding.role}`,
    );
    const extras = (binding.members ?? []).filter(
      (member) => !expectedMembers.includes(member),
    );
    assert(
      extras.length === 0,
      `${boundary} has unreviewed members: ${extras.join(",")}`,
    );
  }
}

function compareExactRoles(actual, expected, missing, missingValue, boundary) {
  const extras = actual.filter((role) => !expected.includes(role));
  assert(
    extras.length === 0,
    `${boundary} has unreviewed roles: ${extras.join(",")}`,
  );
  for (const role of expected) {
    if (!actual.includes(role)) missing.push(`${missingValue}:${role}`);
  }
}

function compareExactMembers(
  actual,
  expected,
  missing,
  missingValue,
  boundary,
) {
  const extras = actual.filter((member) => !expected.includes(member));
  assert(
    extras.length === 0,
    `${boundary} has unreviewed members: ${extras.join(",")}`,
  );
  for (const member of expected) {
    if (!actual.includes(member)) missing.push(`${missingValue}:${member}`);
  }
}

export function classifyObservedProductionFoundation(
  observed,
  foundation = readComingSoonProductionFoundation(),
  { requireReady = false } = {},
) {
  validateComingSoonProductionFoundation(foundation);
  const boundary = foundation.productionBoundary;
  const project = observed.project;
  assert(
    project?.projectId === boundary.projectId,
    "Production project ID drifted",
  );
  assert(
    String(project?.projectNumber) === boundary.projectNumber,
    "Production project number drifted",
  );
  assert(
    project?.parent?.type === "organization" &&
      String(project?.parent?.id) === boundary.organizationId,
    "Production project organization drifted",
  );
  assert(
    project?.lifecycleState === "ACTIVE",
    "Production project is not active",
  );

  const missing = {
    apis: [],
    labels: [],
    repository: [],
    serviceAccounts: [],
    projectBindings: [],
    repositoryBindings: [],
    serviceAccountBindings: [],
    secrets: [],
    secretBindings: [],
  };

  for (const [key, expected] of Object.entries(foundation.projectLabels)) {
    const actual = project.labels?.[key];
    if (actual === undefined) missing.labels.push(key);
    else assert(actual === expected, `Production project label ${key} drifted`);
  }

  const enabledApis = new Set(observed.enabledApis ?? []);
  for (const api of foundation.samraManagedApis) {
    if (!enabledApis.has(api)) missing.apis.push(api);
  }

  const repository = observed.repository;
  const repositoryResource = `projects/${boundary.projectId}/locations/${boundary.region}/repositories/${foundation.artifactRegistry.repository}`;
  if (!repository) {
    missing.repository.push(foundation.artifactRegistry.repository);
  } else {
    assert(
      repository.name === repositoryResource,
      "Production image repository drifted",
    );
    assert(
      String(repository.format).toUpperCase() ===
        foundation.artifactRegistry.format.toUpperCase(),
      "Production image repository format drifted",
    );
    assert(
      repository.dockerConfig?.immutableTags === true,
      "Production image repository must use immutable tags",
    );
    assert(
      repository.description === "Immutable Samra Pay production images",
      "Production image repository description drifted",
    );
    assert(
      repository.labels?.environment === "production" &&
        repository.labels?.data_classification === "customer-pii",
      "Production image repository labels drifted",
    );
  }

  const accountEmails = Object.fromEntries(
    Object.entries(foundation.serviceAccounts).map(([name, id]) => [
      name,
      `${id}@${boundary.projectId}.iam.gserviceaccount.com`,
    ]),
  );
  for (const [name, email] of Object.entries(accountEmails)) {
    const account = observed.serviceAccounts?.[name];
    if (!account) {
      missing.serviceAccounts.push(name);
      continue;
    }
    assert(account.email === email, `Production ${name} identity drifted`);
    assert(
      account.displayName === foundation.serviceAccountDisplayNames[name],
      `Production ${name} identity display name drifted`,
    );
    assert(
      account.disabled !== true,
      `Production ${name} identity is disabled`,
    );
    assert(
      (observed.userManagedKeys?.[name] ?? []).length === 0,
      `Production ${name} identity has a user-managed key`,
    );
  }

  for (const [name, email] of Object.entries(accountEmails)) {
    const expected = sorted(foundation.projectRoleBindings[name] ?? []);
    const actual = roleBindingsForMember(
      observed.projectIamPolicy,
      `serviceAccount:${email}`,
      `Production ${name} project IAM`,
    );
    compareExactRoles(
      actual,
      expected,
      missing.projectBindings,
      name,
      `Production ${name} project IAM`,
    );
  }

  if (!repository) {
    missing.repositoryBindings.push("build:roles/artifactregistry.writer");
    missing.repositoryBindings.push("deployer:roles/artifactregistry.reader");
  } else {
    rejectPublicIam(
      observed.repositoryIamPolicy,
      "Production image repository",
    );
    rejectUnexpectedBindings(
      observed.repositoryIamPolicy,
      {
        "roles/artifactregistry.writer": [
          `serviceAccount:${accountEmails.build}`,
        ],
        "roles/artifactregistry.reader": [
          `serviceAccount:${accountEmails.deployer}`,
        ],
      },
      "Production image repository",
    );
    const expectedRepositoryRoles = {
      build: ["roles/artifactregistry.writer"],
      deployer: ["roles/artifactregistry.reader"],
      api: [],
      customerWeb: [],
      migrations: [],
    };
    for (const [name, email] of Object.entries(accountEmails)) {
      const actual = roleBindingsForMember(
        observed.repositoryIamPolicy,
        `serviceAccount:${email}`,
        `Production repository ${name} IAM`,
      );
      compareExactRoles(
        actual,
        expectedRepositoryRoles[name],
        missing.repositoryBindings,
        name,
        `Production repository ${name} IAM`,
      );
    }
  }

  const deployerMember = `serviceAccount:${accountEmails.deployer}`;
  for (const target of foundation.resourceRoleBindings.runtimeServiceAccountUser
    .targets) {
    const targetPolicy = observed.serviceAccountIamPolicies?.[target];
    if (
      !observed.serviceAccounts?.[target] ||
      !observed.serviceAccounts?.deployer
    ) {
      missing.serviceAccountBindings.push(
        `${target}:roles/iam.serviceAccountUser:${deployerMember}`,
      );
      continue;
    }
    const members = membersForRole(
      targetPolicy,
      "roles/iam.serviceAccountUser",
      `Production ${target} service-account IAM`,
    );
    rejectUnexpectedBindings(
      targetPolicy,
      { "roles/iam.serviceAccountUser": [deployerMember] },
      `Production ${target} service-account IAM`,
    );
    compareExactMembers(
      members,
      [deployerMember],
      missing.serviceAccountBindings,
      `${target}:roles/iam.serviceAccountUser`,
      `Production ${target} service-account IAM`,
    );
  }

  const secretBoundaries = {
    runtime: {
      contract: foundation.secretMetadata[0],
      accessor: "api",
    },
    migrations: {
      contract: foundation.secretMetadata[1],
      accessor: "migrations",
    },
  };
  for (const [name, definition] of Object.entries(secretBoundaries)) {
    const secret = observed.secrets?.[name];
    if (!secret) {
      missing.secrets.push(name);
      missing.secretBindings.push(
        `${name}:roles/secretmanager.secretAccessor:${definition.accessor}`,
      );
      continue;
    }
    assert(
      tail(secret.name) === definition.contract.id,
      `Production ${name} secret identity drifted`,
    );
    const replicas = secret.replication?.userManaged?.replicas ?? [];
    assert(
      replicas.length === 1 && replicas[0].location === boundary.region,
      `Production ${name} secret replication drifted`,
    );
    assert(
      secret.labels?.environment === "production" &&
        secret.labels?.data_classification === "customer-pii",
      `Production ${name} secret labels drifted`,
    );
    assert(
      (observed.secretVersions?.[name] ?? []).length === 0,
      `Production ${name} secret contains a version before database activation`,
    );
    const policy = observed.secretIamPolicies?.[name];
    rejectPublicIam(policy, `Production ${name} secret`);
    const expectedMember = `serviceAccount:${accountEmails[definition.accessor]}`;
    rejectUnexpectedBindings(
      policy,
      { "roles/secretmanager.secretAccessor": [expectedMember] },
      `Production ${name} secret`,
    );
    const members = membersForRole(
      policy,
      "roles/secretmanager.secretAccessor",
      `Production ${name} secret accessor IAM`,
    );
    compareExactMembers(
      members,
      [expectedMember],
      missing.secretBindings,
      `${name}:roles/secretmanager.secretAccessor`,
      `Production ${name} secret accessor IAM`,
    );
  }

  const missingCount = Object.values(missing).reduce(
    (sum, values) => sum + values.length,
    0,
  );
  if (requireReady) {
    assert(missingCount === 0, "Production foundation is not fully applied");
  }
  return Object.freeze({
    schemaVersion: 1,
    status: missingCount === 0 ? "ready" : "missing-exact-state",
    projectId: boundary.projectId,
    projectNumber: boundary.projectNumber,
    region: boundary.region,
    repository: foundation.artifactRegistry.repository,
    serviceAccountCount: Object.keys(accountEmails).length,
    secretMetadataCount: foundation.secretMetadata.length,
    secretVersionCount: Object.values(observed.secretVersions ?? {}).reduce(
      (sum, versions) => sum + versions.length,
      0,
    ),
    missingCount,
    missing,
    deferredPrivateApiInvoker: true,
    cloudMutation: false,
  });
}

function gcloudJson(args) {
  const output = execFileSync("gcloud", [...args, "--quiet", "--format=json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(output || "null");
}

function gcloudText(args) {
  return execFileSync("gcloud", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function collectObservedProductionFoundation(
  foundation = readComingSoonProductionFoundation(),
) {
  const boundary = foundation.productionBoundary;
  const projectId = boundary.projectId;
  const region = boundary.region;
  const repositoryId = foundation.artifactRegistry.repository;
  const project = gcloudJson(["projects", "describe", projectId]);
  const enabledServiceRecords = gcloudJson([
    "services",
    "list",
    "--enabled",
    `--project=${projectId}`,
  ]);
  const enabledApis = enabledServiceRecords.map(
    (service) => service.config?.name,
  );
  const repositories = enabledApis.includes("artifactregistry.googleapis.com")
    ? gcloudJson([
        "artifacts",
        "repositories",
        "list",
        `--project=${projectId}`,
        `--location=${region}`,
      ])
    : [];
  const repositorySummary = repositories.find(
    (repository) => tail(repository.name) === repositoryId,
  );
  const repository = repositorySummary
    ? gcloudJson([
        "artifacts",
        "repositories",
        "describe",
        repositoryId,
        `--project=${projectId}`,
        `--location=${region}`,
      ])
    : null;
  const serviceAccountRecords = gcloudJson([
    "iam",
    "service-accounts",
    "list",
    `--project=${projectId}`,
  ]);
  const secretRecords = enabledApis.includes("secretmanager.googleapis.com")
    ? gcloudJson(["secrets", "list", `--project=${projectId}`])
    : [];

  const observed = {
    project,
    enabledApis,
    repository,
    repositoryIamPolicy: repository
      ? gcloudJson([
          "artifacts",
          "repositories",
          "get-iam-policy",
          repositoryId,
          `--project=${projectId}`,
          `--location=${region}`,
        ])
      : null,
    serviceAccounts: {},
    userManagedKeys: {},
    serviceAccountIamPolicies: {},
    projectIamPolicy: gcloudJson(["projects", "get-iam-policy", projectId]),
    secrets: {},
    secretVersions: {},
    secretIamPolicies: {},
  };

  for (const [name, accountId] of Object.entries(foundation.serviceAccounts)) {
    const email = `${accountId}@${projectId}.iam.gserviceaccount.com`;
    const account = serviceAccountRecords.find(
      (candidate) => candidate.email === email,
    );
    observed.serviceAccounts[name] = account ?? null;
    observed.userManagedKeys[name] = account
      ? gcloudJson([
          "iam",
          "service-accounts",
          "keys",
          "list",
          `--iam-account=${email}`,
          `--project=${projectId}`,
          "--managed-by=user",
        ])
      : [];
    observed.serviceAccountIamPolicies[name] = account
      ? gcloudJson([
          "iam",
          "service-accounts",
          "get-iam-policy",
          email,
          `--project=${projectId}`,
        ])
      : null;
  }

  const secretDefinitions = {
    runtime: foundation.secretMetadata[0],
    migrations: foundation.secretMetadata[1],
  };
  for (const [name, definition] of Object.entries(secretDefinitions)) {
    const exists = secretRecords.some(
      (candidate) => tail(candidate.name) === definition.id,
    );
    observed.secrets[name] = exists
      ? gcloudJson([
          "secrets",
          "describe",
          definition.id,
          `--project=${projectId}`,
        ])
      : null;
    observed.secretVersions[name] = exists
      ? gcloudJson([
          "secrets",
          "versions",
          "list",
          definition.id,
          `--project=${projectId}`,
        ])
      : [];
    observed.secretIamPolicies[name] = exists
      ? gcloudJson([
          "secrets",
          "get-iam-policy",
          definition.id,
          `--project=${projectId}`,
        ])
      : null;
  }
  return observed;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const mode = process.argv[2] ?? "--review";
    assert(
      mode === "--review" || mode === "--require-ready",
      "Usage: inspect-coming-soon-production-foundation.mjs [--review|--require-ready]",
    );
    const environment = validateProductionFoundationActivationEnvironment();
    assert(
      gcloudText(["config", "get-value", "account"]) === environment.operator,
      "Active Google account drifted",
    );
    assert(
      gcloudText(["config", "get-value", "project"]) === environment.projectId,
      "Active Google project drifted",
    );
    const result = classifyObservedProductionFoundation(
      collectObservedProductionFoundation(),
      readComingSoonProductionFoundation(),
      { requireReady: mode === "--require-ready" },
    );
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(
      `Production foundation inspection rejected: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
