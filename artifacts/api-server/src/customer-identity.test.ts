import assert from "node:assert/strict";
import test from "node:test";
import type {
  CustomerIdentityCaseSnapshot,
  CustomerIdentityCaseStore,
  CustomerIdentityProviderDecision,
} from "@workspace/db";
import {
  CustomerIdentityVerificationService,
  DeterministicFakePersonaAdapter,
  IdentityProviderUnavailableError,
  type CustomerIdentityProvider,
} from "./domain/customer-identity";

function snapshot(
  state: CustomerIdentityCaseSnapshot["state"],
): CustomerIdentityCaseSnapshot {
  return Object.freeze({
    identityCaseId: "identity_case_00000000000000000000000000000001",
    state,
    reasonFamily: state === "error" ? "identity_provider_unavailable" : null,
    provider: "persona",
    synthetic: true,
    version: state === "created" ? 1 : 2,
    decidedAt: null,
    createdAt: "2026-08-19T00:00:00.000Z",
    updatedAt: "2026-08-19T00:00:00.000Z",
    nextAllowedActions: [],
  });
}

function storeWith(
  overrides: Partial<CustomerIdentityCaseStore>,
): CustomerIdentityCaseStore {
  const notUsed = async (): Promise<never> => {
    throw new Error("unexpected store call");
  };
  return {
    prepareAuth0IdentityCase: notUsed,
    attachProviderInquiry: notUsed,
    recordProviderStartFailure: notUsed,
    getAuth0IdentityCase: notUsed,
    recordProviderEvent: notUsed,
    ...overrides,
  };
}

test("fake Persona inquiry references are stable without receiving customer PII", async () => {
  const provider = new DeterministicFakePersonaAdapter();
  const input = {
    identityCaseId: "identity_case_00000000000000000000000000000001",
    providerRequestKey: "a".repeat(64),
  };
  const first = await provider.createInquiry(input);
  const second = await provider.createInquiry(input);
  assert.deepEqual(first, second);
  assert.match(first.providerInquiryRef, /^inq_fake_[0-9a-f]{32}$/u);
  assert.doesNotMatch(
    JSON.stringify(first),
    /email|phone|name|subject|token/iu,
  );
});

test("provider-start failure is durably recorded and returned as unavailable", async () => {
  const failures: Array<{ identityCaseId: string; reasonFamily: string }> = [];
  const store = storeWith({
    async prepareAuth0IdentityCase() {
      return Object.freeze({
        snapshot: snapshot("created"),
        providerRequestKey: "b".repeat(64),
        created: true,
      });
    },
    async recordProviderStartFailure(input) {
      failures.push(input);
      return snapshot("error");
    },
  });
  const provider: CustomerIdentityProvider = {
    provider: "persona",
    async createInquiry() {
      throw new Error("synthetic outage");
    },
  };
  const service = new CustomerIdentityVerificationService({ store, provider });

  await assert.rejects(
    service.startAuth0IdentityVerification({
      issuer: "https://tenant.example.test/",
      subject: "auth0|subject",
      idempotencyKey: "identity-start-001",
    }),
    IdentityProviderUnavailableError,
  );
  assert.deepEqual(failures, [
    {
      identityCaseId: snapshot("created").identityCaseId,
      reasonFamily: "identity_provider_unavailable",
    },
  ]);
});

test("a concurrent successful provider start wins over a failing caller", async () => {
  const pending = snapshot("pending");
  const store = storeWith({
    async prepareAuth0IdentityCase() {
      return Object.freeze({
        snapshot: snapshot("created"),
        providerRequestKey: "d".repeat(64),
        created: true,
      });
    },
    async recordProviderStartFailure() {
      return pending;
    },
  });
  const provider: CustomerIdentityProvider = {
    provider: "persona",
    async createInquiry() {
      throw new Error("one concurrent provider call failed");
    },
  };
  const service = new CustomerIdentityVerificationService({ store, provider });
  const result = await service.startAuth0IdentityVerification({
    issuer: "https://tenant.example.test/",
    subject: "auth0|subject",
    idempotencyKey: "identity-start-003",
  });
  assert.equal(result.snapshot.state, "pending");
  assert.equal(result.created, false);
});

test("an already-started identity case resumes without another provider call", async () => {
  let providerCalls = 0;
  const store = storeWith({
    async prepareAuth0IdentityCase() {
      return Object.freeze({
        snapshot: snapshot("pending"),
        providerRequestKey: "c".repeat(64),
        created: false,
      });
    },
  });
  const provider: CustomerIdentityProvider = {
    provider: "persona",
    async createInquiry() {
      providerCalls += 1;
      return { providerInquiryRef: "must-not-be-used" };
    },
  };
  const service = new CustomerIdentityVerificationService({ store, provider });
  const result = await service.startAuth0IdentityVerification({
    issuer: "https://tenant.example.test/",
    subject: "auth0|subject",
    idempotencyKey: "identity-start-002",
  });
  assert.equal(result.snapshot.state, "pending");
  assert.equal(result.created, false);
  assert.equal(providerCalls, 0);
});

test("fake provider decisions use deterministic references and digest-only evidence", async () => {
  const observed: Array<{
    providerEventRef: string;
    decision: CustomerIdentityProviderDecision;
    payloadDigest: string;
  }> = [];
  const store = storeWith({
    async recordProviderEvent(input) {
      observed.push(input);
      return Object.freeze({
        snapshot: snapshot(input.decision),
        replayed: false,
        disposition: "applied" as const,
      });
    },
  });
  const service = new CustomerIdentityVerificationService({
    store,
    provider: new DeterministicFakePersonaAdapter(),
  });
  await service.simulateProviderDecision({
    identityCaseId: snapshot("pending").identityCaseId,
    decision: "review",
    idempotencyKey: "identity-decision-001",
  });
  await service.simulateProviderDecision({
    identityCaseId: snapshot("pending").identityCaseId,
    decision: "review",
    idempotencyKey: "identity-decision-001",
  });
  assert.equal(observed.length, 2);
  assert.equal(observed[0]!.providerEventRef, observed[1]!.providerEventRef);
  assert.equal(observed[0]!.payloadDigest, observed[1]!.payloadDigest);
  assert.match(observed[0]!.payloadDigest, /^[0-9a-f]{64}$/u);
});
