import { createResendTransport } from "./resend.mjs";

export const launchUpdatesIdentity = Object.freeze({
  projectId: "samra-pay-production",
  secretId: "samra-production-resend-api-key",
  from: "Samra Pay <updates@mail.samrapay.com>",
  replyTo: "support@samrapay.com",
});

const opaqueId = /^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/u;
const emailAddress =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/u;

function fail() {
  throw new Error("LAUNCH_UPDATES_TEST_CONFIGURATION_INVALID");
}

/**
 * Restricted connection-test preparation, NOT a public subscription service.
 * No environment, secret payload, network client, or listener is read/created
 * at import time. The future approved runtime must inject env and fetch.
 * Approval metadata is a guard, not evidence that a human approved a run.
 */
export function createLaunchUpdatesConnectionTest({
  env = {},
  fetchImpl,
  now = () => Date.now(),
} = {}) {
  if (typeof window !== "undefined") fail();
  if (typeof env !== "object" || env === null) fail();
  if (
    Object.keys(env).some((key) =>
      /^(?:VITE_|NEXT_PUBLIC_|PUBLIC_).*RESEND/iu.test(key),
    )
  )
    fail();

  const mode = env.SAMRA_LAUNCH_UPDATES_MODE ?? "disabled";
  if (mode === "disabled") {
    return Object.freeze({
      enabled: false,
      metadata: launchUpdatesIdentity,
      async sendConnectionTest() {
        throw new Error("LAUNCH_UPDATES_DISABLED");
      },
    });
  }
  // There is deliberately no live/public mode and no subscriber import path.
  if (mode !== "test" || typeof fetchImpl !== "function") fail();

  const recipient = env.SAMRA_LAUNCH_UPDATES_TEST_RECIPIENT;
  const approvalId = env.SAMRA_LAUNCH_UPDATES_TEST_APPROVAL_ID;
  const expiresAt = env.SAMRA_LAUNCH_UPDATES_TEST_EXPIRES_AT;
  const version = env.SAMRA_RESEND_SECRET_VERSION;
  const key = env.RESEND_API_KEY;
  if (
    typeof recipient !== "string" ||
    recipient.length > 254 ||
    !emailAddress.test(recipient) ||
    recipient !== recipient.trim() ||
    typeof approvalId !== "string" ||
    !opaqueId.test(approvalId) ||
    typeof version !== "string" ||
    !/^[1-9][0-9]{0,9}$/u.test(version) ||
    typeof key !== "string" ||
    !/^re_[A-Za-z0-9_-]{10,}$/u.test(key) ||
    typeof expiresAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(expiresAt)
  )
    fail();

  const deadline = Date.parse(expiresAt);
  const openedAt = now();
  if (
    !Number.isFinite(openedAt) ||
    !Number.isFinite(deadline) ||
    new Date(deadline).toISOString() !== expiresAt ||
    deadline <= openedAt ||
    deadline > openedAt + 60 * 60 * 1000
  )
    fail();

  const transport = createResendTransport({ apiKey: key, fetchImpl });
  function assertApprovalCurrent() {
    const timestamp = now();
    if (
      !Number.isFinite(timestamp) ||
      timestamp < openedAt ||
      timestamp >= deadline
    ) {
      throw new Error("LAUNCH_UPDATES_TEST_APPROVAL_EXPIRED");
    }
  }
  let attempt;
  const metadata = Object.freeze({
    ...launchUpdatesIdentity,
    secretVersion: version,
    approvalId,
    expiresAt,
    recipientConfigured: true,
  });
  return Object.freeze({
    enabled: true,
    metadata,
    async sendConnectionTest() {
      assertApprovalCurrent();
      // Concurrent/repeated invocations share one attempt. A new approved run
      // may retry the SAME approval ID inside its original expiry window.
      attempt ??= (async () => {
        assertApprovalCurrent();
        const suppression = await transport.getSuppression(recipient);
        if (suppression) {
          throw new Error("LAUNCH_UPDATES_TEST_RECIPIENT_UNAVAILABLE");
        }
        assertApprovalCurrent();
        const contact = await transport.getContact(recipient);
        if (contact?.unsubscribed === true) {
          throw new Error("LAUNCH_UPDATES_TEST_RECIPIENT_UNAVAILABLE");
        }
        assertApprovalCurrent();
        return transport.sendConfirmation({
          email: recipient,
          from: launchUpdatesIdentity.from,
          replyTo: launchUpdatesIdentity.replyTo,
          subject: "Samra Pay email connection test",
          text: [
            "This is the requested Samra Pay email connection test.",
            "No launch-updates subscription has been created by this message.",
            "Replies go to support@samrapay.com.",
            "Samra Pay is owned by Fiscal Clarity LLC.",
          ].join("\n\n"),
          idempotencyKey: `samra-launch-updates-test-${approvalId}`,
        });
      })();
      return attempt;
    },
  });
}
