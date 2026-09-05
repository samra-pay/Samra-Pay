import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeWaitlistProfile } from "./waitlist-profile.mjs";

test("optional profiles omit blank values and preserve international names", () => {
  assert.deepEqual(normalizeWaitlistProfile(), {});
  assert.deepEqual(
    normalizeWaitlistProfile({ firstName: "  ", phoneNumber: " " }),
    {},
  );
  assert.deepEqual(
    normalizeWaitlistProfile({
      firstName: "  ዳዊት  ",
      phoneNumber: "+251911234567",
    }),
    { firstName: "ዳዊት", phoneNumber: "+251911234567" },
  );
});
test("rejects malformed profile values without echoing personal data", () => {
  for (const profile of [
    { firstName: null },
    { firstName: 42 },
    { firstName: "a".repeat(101) },
    { firstName: "name\nInjected" },
    { firstName: "name\u202e" },
    { phoneNumber: null },
    { phoneNumber: 12025550123 },
    { phoneNumber: "2025550123" },
    { phoneNumber: "+0123456789" },
    { phoneNumber: "+12025550123x9" },
    { phoneNumber: "+1" },
    { phoneNumber: "+1234567890123456" },
  ])
    assert.throws(
      () => normalizeWaitlistProfile(profile),
      /^Error: INVALID_PROFILE$/,
    );
});
