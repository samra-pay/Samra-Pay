import assert from "node:assert/strict";
import test from "node:test";
import {
  InMemoryMarketingWaitlistStore,
  normalizeWaitlistEmail,
} from "./postgres-marketing-waitlist";

test("waitlist email normalization is deterministic", () => {
  assert.equal(
    normalizeWaitlistEmail("  Founder@Example.Test  "),
    "founder@example.test",
  );
});

test("waitlist consent replays one command and rejects conflicting reuse", async () => {
  const store = new InMemoryMarketingWaitlistStore();
  const input = {
    email: "Founder@Example.Test",
    consentVersion: "coming-soon-2026-08-30",
    locale: "en" as const,
    idempotencyKey: "waitlist-command-001",
  };
  const first = await store.subscribe(input);
  const replay = await store.subscribe(input);
  assert.deepEqual(replay, first);
  await assert.rejects(
    store.subscribe({ ...input, email: "different@example.test" }),
    /reused with different input/,
  );
});
