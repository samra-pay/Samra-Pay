import assert from "node:assert/strict";
import test from "node:test";
import { parseCustomerIdentityHostedLaunch } from "./onboarding.ts";

test("hosted launch parsing accepts only the sandbox Persona capability and a safe verification URL", () => {
  const launch = {
    provider: "persona",
    environment: "sandbox",
    url: "https://inquiry.withpersona.com/verify?code=SYNTHETICHOSTEDLINK123",
  };
  assert.deepEqual(parseCustomerIdentityHostedLaunch(launch), launch);
  assert.ok(Object.isFrozen(parseCustomerIdentityHostedLaunch(launch)));
  for (const invalid of [
    null,
    {},
    { ...launch, environment: "production" },
    ...[
      "javascript:alert(1)",
      "https://inquiry.withpersona.com.evil.test/verify?code=abcdefgh",
      "https://evil.test/verify?code=abcdefgh",
      "http://inquiry.withpersona.com/verify?code=abcdefgh",
      "https://user@inquiry.withpersona.com/verify?code=abcdefgh",
      "https://inquiry.withpersona.com/verify?code=abcdefgh&code=ijklmnop",
      "https://inquiry.withpersona.com/verify?code=abcdefgh&redirect-uri=https://evil.test",
      "https://inquiry.withpersona.com/verify?code=abcdefgh#fragment",
      "https://inquiry.withpersona.com/other?code=abcdefgh",
    ].map((url) => ({ ...launch, url })),
  ])
    assert.throws(() => parseCustomerIdentityHostedLaunch(invalid));
});
