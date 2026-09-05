#!/usr/bin/env node

import { resolve } from "node:path";
import {
  readStagingGithubEnterpriseMigration,
  validateStagingGithubEnterpriseMigration,
} from "./validate-staging-github-enterprise-migration.mjs";

const mode = process.argv[2] ?? "--review";
if (mode !== "--review") {
  console.error("Usage: review-staging-github-enterprise-migration.mjs --review");
  process.exit(2);
}

const root = resolve(new URL("../..", import.meta.url).pathname);
const contract = readStagingGithubEnterpriseMigration();
const result = validateStagingGithubEnterpriseMigration(contract, { root });

console.log("READ-ONLY GITHUB ENTERPRISE MIGRATION REVIEW PASS");
console.log(`Status: ${result.status}`);
console.log(`Operating model: ${result.operatingModel}`);
console.log(`Active: ${result.activeRepository}`);
console.log(`Target: ${result.targetRepository}`);
console.log(`Stable repository ID to reverify: ${result.stableRepositoryId}`);
console.log(`Target organization ID: ${result.targetOwnerId}`);
console.log(
  [
    `Account recovery: ${result.accountRecoveryReadiness}`,
    `2FA: ${result.twoFactorAuthenticationEnabled ? "enabled" : "disabled"}`,
    `passkey/security key: ${result.passkeyOrSecurityKeyConfigured ? "configured" : "missing"}`,
  ].join("; "),
);
console.log(
  `Operational authority references inventoried: ${result.currentAuthorityFileCount}`,
);
console.log(`Blocking gates: ${contract.blockingGates.join(", ")}`);
console.log("RECORDED GITHUB TRANSFER COMPLETE; CLOUD CUTOVER PENDING");
console.log("CLOUD APPLY AND RELEASE RESUMPTION NOT AUTHORIZED — OFFLINE REVIEW ONLY");
