import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  readComingSoonProductionDataFoundation,
  validateComingSoonProductionDataFoundation,
  validateObservedProductionDataSqlInstance,
  validateProductionDataActivationEnvironment,
  validateProductionDataCostEstimateFreshness,
} from "./validate-coming-soon-production-data-foundation.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function tail(resourceName) {
  return String(resourceName ?? "")
    .split("/")
    .at(-1);
}

function ipv4ToNumber(address) {
  const octets = String(address).split(".").map(Number);
  assert(
    octets.length === 4 &&
      octets.every(
        (octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255,
      ),
    `Invalid IPv4 address: ${address}`,
  );
  return octets.reduce((value, octet) => value * 256 + octet, 0);
}

function cidrBounds(cidr) {
  const [address, prefixText, extra] = String(cidr).split("/");
  const prefix = Number(prefixText);
  assert(
    extra === undefined &&
      Number.isInteger(prefix) &&
      prefix >= 8 &&
      prefix <= 30,
    `Invalid bounded IPv4 CIDR: ${cidr}`,
  );
  const start = ipv4ToNumber(address);
  const size = 2 ** (32 - prefix);
  assert(start % size === 0, `CIDR is not network-aligned: ${cidr}`);
  return { start, end: start + size - 1 };
}

function overlaps(left, right) {
  const a = cidrBounds(left);
  const b = cidrBounds(right);
  return a.start <= b.end && b.start <= a.end;
}

function networkMatches(resource, networkName) {
  return tail(resource?.network) === networkName;
}

export function classifyObservedProductionDataFoundation(
  observed,
  contract = readComingSoonProductionDataFoundation(),
  { requireReady = false } = {},
) {
  validateComingSoonProductionDataFoundation(contract);
  const boundary = contract.productionBoundary;
  const network = contract.network;
  const database = contract.database;
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
    network: [],
    subnet: [],
    privateServicesAccess: [],
    serviceConnection: [],
    instance: [],
    database: [],
  };

  if (!observed.network) {
    missing.network.push(network.name);
  } else {
    assert(
      tail(observed.network.name) === network.name,
      "Production VPC identity drifted",
    );
    assert(
      observed.network.autoCreateSubnetworks === false &&
        observed.network.routingConfig?.routingMode === network.routingMode,
      "Production VPC mode or routing drifted",
    );
  }

  if (!observed.subnet) {
    missing.subnet.push(network.subnet.name);
  } else {
    assert(
      tail(observed.subnet.name) === network.subnet.name,
      "Production subnet identity drifted",
    );
    assert(
      observed.subnet.ipCidrRange === network.subnet.cidr &&
        observed.subnet.privateIpGoogleAccess === true &&
        networkMatches(observed.subnet, network.name),
      "Production subnet drifted",
    );
  }

  for (const subnet of observed.allSubnets ?? []) {
    if (
      networkMatches(subnet, network.name) &&
      tail(subnet.name) !== network.subnet.name
    ) {
      assert(
        !overlaps(network.subnet.cidr, subnet.ipCidrRange) &&
          !overlaps(
            `${network.privateServicesAccess.address}/${network.privateServicesAccess.prefixLength}`,
            subnet.ipCidrRange,
          ),
        `Production data CIDR overlaps subnet ${tail(subnet.name)}`,
      );
    }
  }

  const allocation = observed.privateServicesAccess;
  if (!allocation) {
    missing.privateServicesAccess.push(network.privateServicesAccess.rangeName);
  } else {
    assert(
      tail(allocation.name) === network.privateServicesAccess.rangeName &&
        allocation.address === network.privateServicesAccess.address &&
        Number(allocation.prefixLength) ===
          network.privateServicesAccess.prefixLength &&
        allocation.purpose === network.privateServicesAccess.purpose &&
        allocation.addressType === "INTERNAL" &&
        networkMatches(allocation, network.name),
      "Production Private Services Access allocation drifted",
    );
  }

  for (const address of observed.allGlobalAddresses ?? []) {
    if (
      networkMatches(address, network.name) &&
      address.address &&
      address.prefixLength &&
      tail(address.name) !== network.privateServicesAccess.rangeName
    ) {
      const addressCidr = `${address.address}/${address.prefixLength}`;
      assert(
        !overlaps(network.subnet.cidr, addressCidr) &&
          !overlaps(
            `${network.privateServicesAccess.address}/${network.privateServicesAccess.prefixLength}`,
            addressCidr,
          ),
        `Production data CIDR overlaps allocation ${tail(address.name)}`,
      );
    }
  }

  const serviceConnections = observed.serviceConnections ?? [];
  const reviewedConnection = serviceConnections.find((connection) =>
    (connection.reservedPeeringRanges ?? []).includes(
      network.privateServicesAccess.rangeName,
    ),
  );
  const unreviewedRanges = serviceConnections.flatMap((connection) =>
    (connection.reservedPeeringRanges ?? []).filter(
      (range) => range !== network.privateServicesAccess.rangeName,
    ),
  );
  assert(
    unreviewedRanges.length === 0,
    `Production service connection uses unreviewed ranges: ${unreviewedRanges.join(",")}`,
  );
  if (!reviewedConnection) {
    missing.serviceConnection.push(network.privateServicesAccess.service);
  }

  if (!observed.instance) {
    missing.instance.push(database.name);
  } else {
    validateObservedProductionDataSqlInstance(observed.instance, contract);
  }

  const databaseNames = (observed.databases ?? []).map((entry) => entry.name);
  if (!databaseNames.includes(database.applicationDatabase.name)) {
    missing.database.push(database.applicationDatabase.name);
  }

  assert(
    Number(observed.secretVersionCount ?? 0) === 0,
    "Production database secret versions exist before the credential phase",
  );
  assert(
    Number(observed.cloudRunServiceCount ?? 0) === 0 &&
      Number(observed.cloudRunJobCount ?? 0) === 0,
    "Production Cloud Run changed before its approved phase",
  );

  const missingCount = Object.values(missing).reduce(
    (sum, values) => sum + values.length,
    0,
  );
  if (requireReady) {
    assert(
      missingCount === 0,
      "Production data foundation is not fully applied",
    );
  }
  return Object.freeze({
    schemaVersion: 1,
    status: missingCount === 0 ? "ready" : "missing-exact-state",
    projectId: boundary.projectId,
    projectNumber: boundary.projectNumber,
    region: boundary.region,
    network: network.name,
    subnet: network.subnet.name,
    privateServicesAccess: network.privateServicesAccess.rangeName,
    instance: database.name,
    database: database.applicationDatabase.name,
    missingCount,
    missing,
    secretVersionCount: Number(observed.secretVersionCount ?? 0),
    cloudRunServiceCount: Number(observed.cloudRunServiceCount ?? 0),
    cloudRunJobCount: Number(observed.cloudRunJobCount ?? 0),
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

export function collectObservedProductionDataFoundation(
  contract = readComingSoonProductionDataFoundation(),
) {
  const projectId = contract.productionBoundary.projectId;
  const region = contract.productionBoundary.region;
  const networkName = contract.network.name;
  const instanceName = contract.database.name;
  const networks = gcloudJson([
    "compute",
    "networks",
    "list",
    `--project=${projectId}`,
  ]);
  const network =
    networks.find((candidate) => tail(candidate.name) === networkName) ?? null;
  const allSubnets = network
    ? gcloudJson([
        "compute",
        "networks",
        "subnets",
        "list",
        `--project=${projectId}`,
      ])
    : [];
  const subnet =
    allSubnets.find(
      (candidate) => tail(candidate.name) === contract.network.subnet.name,
    ) ?? null;
  const allGlobalAddresses = network
    ? gcloudJson([
        "compute",
        "addresses",
        "list",
        "--global",
        `--project=${projectId}`,
      ])
    : [];
  const privateServicesAccess =
    allGlobalAddresses.find(
      (candidate) =>
        tail(candidate.name) ===
        contract.network.privateServicesAccess.rangeName,
    ) ?? null;
  const serviceConnections = network
    ? gcloudJson([
        "services",
        "vpc-peerings",
        "list",
        `--project=${projectId}`,
        `--network=${networkName}`,
        `--service=${contract.network.privateServicesAccess.service}`,
      ])
    : [];
  const instances = gcloudJson([
    "sql",
    "instances",
    "list",
    `--project=${projectId}`,
  ]);
  const hasInstance = instances.some(
    (candidate) => candidate.name === instanceName,
  );
  const instance = hasInstance
    ? gcloudJson([
        "sql",
        "instances",
        "describe",
        instanceName,
        `--project=${projectId}`,
      ])
    : null;
  const databases = instance
    ? gcloudJson([
        "sql",
        "databases",
        "list",
        `--project=${projectId}`,
        `--instance=${instanceName}`,
      ])
    : [];
  const secretVersionCount =
    contract.prerequisiteEvidence.secretMetadataCount === 2
      ? [
          "samra-production-runtime-database-url",
          "samra-production-migration-database-url",
        ].flatMap((secret) =>
          gcloudJson([
            "secrets",
            "versions",
            "list",
            secret,
            `--project=${projectId}`,
          ]),
        ).length
      : Number.NaN;
  const cloudRunServiceCount = gcloudJson([
    "run",
    "services",
    "list",
    `--project=${projectId}`,
    `--region=${region}`,
  ]).length;
  const cloudRunJobCount = gcloudJson([
    "run",
    "jobs",
    "list",
    `--project=${projectId}`,
    `--region=${region}`,
  ]).length;
  return {
    project: gcloudJson(["projects", "describe", projectId]),
    network,
    subnet,
    allSubnets,
    privateServicesAccess,
    allGlobalAddresses,
    serviceConnections,
    instance,
    databases,
    secretVersionCount,
    cloudRunServiceCount,
    cloudRunJobCount,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const mode = process.argv[2] ?? "--review";
    assert(
      mode === "--review" || mode === "--require-ready",
      "Usage: inspect-coming-soon-production-data-foundation.mjs [--review|--require-ready]",
    );
    const environment = validateProductionDataActivationEnvironment();
    validateProductionDataCostEstimateFreshness();
    assert(
      gcloudText(["config", "get-value", "account"]) === environment.operator,
      "Active Google account drifted",
    );
    assert(
      gcloudText(["config", "get-value", "project"]) === environment.projectId,
      "Active Google project drifted",
    );
    const result = classifyObservedProductionDataFoundation(
      collectObservedProductionDataFoundation(),
      readComingSoonProductionDataFoundation(),
      { requireReady: mode === "--require-ready" },
    );
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(
      `Production data foundation inspection rejected: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
