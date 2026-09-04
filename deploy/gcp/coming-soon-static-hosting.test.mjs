import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  readComingSoonStaticHosting,
  readFirebaseHostingConfig,
  validateComingSoonStaticHosting,
  validateStaticHostingEnvironment,
} from "./validate-coming-soon-static-hosting.mjs";

const SEGMENT_ID = "3302de0a-0f51-4c3e-9f4e-f26ebf95f412";
const TOPIC_ID = "244e46ec-7cda-4cf2-8e6e-1e13093125ab";
const validEnvironment = {
  SAMRA_GCP_PROJECT_ID: "samra-pay-production",
  SAMRA_GCP_PROJECT_NUMBER: "382465561715",
  SAMRA_GCP_ORGANIZATION_ID: "614833350075",
  SAMRA_GCP_OPERATOR_ACCOUNT: "me@davidhaile.com",
  SAMRA_GCP_EXPECTED_SHA: "a".repeat(40),
  SAMRA_RESEND_SEGMENT_ID: SEGMENT_ID,
  SAMRA_RESEND_TOPIC_ID: TOPIC_ID,
};

test("locks the approved email-only waitlist boundary", () => {
  assert.deepEqual(validateComingSoonStaticHosting(), {
    schemaVersion: 2,
    status: "validated-approved-for-pr-not-applied",
    phase: "controlled-public-email-waitlist",
    projectId: "samra-pay-production",
    projectNumber: "382465561715",
    siteId: "samra-pay-production",
    serviceId: "samra-launch-updates",
    canonicalDomain: "www.samrapay.com",
    emailCollectionAllowed: true,
    publicApiRouteCount: 1,
    databaseAccess: false,
    automaticEmailSending: false,
    analytics: "consent-gated-ga4",
    expectedIncrementalMonthlyCostUsd: 0,
    existingInfrastructureGuardedEstimateUsd: 81.92,
    monthlyInfrastructureHardStopUsd: 100,
    applyAuthorized: false,
    dnsChangeAuthorized: false,
  });
});

test("rejects product, database, sending, identity, cost, and DNS expansion", () => {
  for (const mutate of [
    (value) => (value.status = "applied"),
    (value) => (value.productionBoundary.projectId = "samra-pay-staging"),
    (value) =>
      (value.productionBoundary.monthlyInfrastructureHardStopUsd = 101),
    (value) => (value.waitlistAmendment.emailOnly = false),
    (value) => (value.waitlistAmendment.automaticEmailSending = true),
    (value) => (value.waitlistAmendment.topicDefaultSubscription = "opt_in"),
    (value) => (value.waitlistAmendment.topicVisibility = "private"),
    (value) => (value.waitlistAmendment.segmentAndTopicIdsCommitted = true),
    (value) => (value.publicBoundary.collectedFields = ["email", "phone"]),
    (value) => (value.publicBoundary.databaseAccess = true),
    (value) => (value.publicBoundary.customerAuthentication = true),
    (value) => (value.publicBoundary.financialVendorActivation = true),
    (value) => (value.publicBoundary.automaticCampaignSending = true),
    (value) => (value.waitlistService.maxInstances = 10),
    (value) => (value.waitlistService.concurrency = 20),
    (value) => (value.waitlistService.providerMinimumIntervalMs = 0),
    (value) => (value.waitlistService.secretVersion = "latest"),
    (value) =>
      (value.waitlistService.buildServiceAccount =
        "samra-cloud-build-staging@samra-pay-staging.iam.gserviceaccount.com"),
    (value) =>
      (value.waitlistService.buildSourceBucket =
        "samra-pay-staging_cloudbuild"),
    (value) =>
      (value.waitlistService.buildSourceBucketRole =
        "roles/storage.objectAdmin"),
    (value) => (value.waitlistService.projectLevelStorageRoleAllowed = true),
    (value) => (value.waitlistService.vpcAccess = true),
    (value) => (value.waitlistService.rawEmailLogsAllowed = true),
    (value) => (value.waitlistService.resubscribeUnsubscribedContact = true),
    (value) => (value.cost.expectedIncrementalMonthlyCostUsd = 1),
    (value) => (value.cost.spendingCap = true),
    (value) => (value.domain.dnsOwner = "Google Cloud DNS"),
    (value) => (value.domain.dnsChangeAuthorized = true),
    (value) => (value.decision.standingApplyAuthorization = true),
  ]) {
    const contract = structuredClone(readComingSoonStaticHosting());
    mutate(contract);
    assert.throws(() => validateComingSoonStaticHosting(contract));
  }
});

test("requires exact production identity, SHA, segment, topic, and apply sentinel", () => {
  assert.deepEqual(validateStaticHostingEnvironment(validEnvironment), {
    projectId: "samra-pay-production",
    projectNumber: "382465561715",
    organizationId: "614833350075",
    operator: "me@davidhaile.com",
    expectedSha: "a".repeat(40),
    segmentId: SEGMENT_ID,
    topicId: TOPIC_ID,
  });
  for (const patch of [
    { SAMRA_GCP_PROJECT_ID: "samra-pay-staging" },
    { SAMRA_GCP_EXPECTED_SHA: "main" },
    { SAMRA_RESEND_SEGMENT_ID: "bad" },
    { SAMRA_RESEND_TOPIC_ID: SEGMENT_ID },
  ]) {
    assert.throws(() =>
      validateStaticHostingEnvironment({ ...validEnvironment, ...patch }),
    );
  }
  assert.throws(() =>
    validateStaticHostingEnvironment(validEnvironment, {
      requireApplyAuthorization: true,
    }),
  );
  assert.doesNotThrow(() =>
    validateStaticHostingEnvironment(
      {
        ...validEnvironment,
        SAMRA_GCP_PUBLIC_WAITLIST_APPLY: "AUTHORIZED_PUBLIC_WAITLIST_RELEASE",
      },
      { requireApplyAuthorization: true },
    ),
  );
});

test("routes one same-origin waitlist endpoint before the SPA fallback", () => {
  const firebase = readFirebaseHostingConfig();
  assert.equal(firebase.hosting.public, "artifacts/samra-pay/dist/public");
  assert.deepEqual(firebase.hosting.rewrites, [
    {
      source: "/api/v1/waitlist/subscriptions",
      run: {
        serviceId: "samra-launch-updates",
        region: "us-east4",
        pinTag: true,
      },
    },
    { source: "**", destination: "/index.html" },
  ]);
  const headers = new Map(
    firebase.hosting.headers
      .flatMap((rule) => rule.headers)
      .map((header) => [header.key, header.value]),
  );
  assert.match(
    headers.get("Content-Security-Policy"),
    /connect-src 'self' https:\/\/www\.google-analytics\.com/u,
  );
  assert.doesNotMatch(
    headers.get("Content-Security-Policy"),
    /api\.resend\.com|\*|unsafe-inline|unsafe-eval/u,
  );
  assert.match(headers.get("Content-Security-Policy"), /form-action 'none'/u);
  assert.equal(headers.get("X-Frame-Options"), "DENY");
});

test("enables the email form without exposing provider, storage, or analytics access", async () => {
  const [form, client, privacy, faq] = await Promise.all(
    [
      "../../artifacts/samra-pay/src/components/launch-updates-form.tsx",
      "../../artifacts/samra-pay/src/lib/public-waitlist.ts",
      "../../artifacts/samra-pay/src/pages/public-legal.tsx",
      "../../artifacts/samra-pay/src/content/public-faq.ts",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );
  assert.match(form, /type="email"/u);
  assert.match(form, /subscribePublicWaitlist/u);
  assert.match(form, /Email consent is required/u);
  assert.match(form, /Privacy policy/u);
  assert.doesNotMatch(
    form,
    /api\.resend\.com|RESEND_API_KEY|localStorage|sessionStorage|gtag\(/u,
  );
  assert.match(client, /\/api\/v1\/waitlist\/subscriptions/u);
  assert.match(client, /public-waitlist-2026-09-04/u);
  assert.doesNotMatch(client, /api\.resend\.com|RESEND_API_KEY/u);
  assert.match(privacy, /Resend, our email provider/u);
  assert.match(privacy, /until you unsubscribe or ask us to delete it/u);
  assert.match(faq, /submit your email for product and availability updates/u);
});

test("keeps the service build context allowlisted and non-root", async () => {
  const [dockerfile, dockerignore, gcloudignore, cloudbuild] =
    await Promise.all(
      [
        "../../lib/launch-updates/Dockerfile.waitlist",
        "../../lib/launch-updates/.dockerignore",
        "../../lib/launch-updates/.gcloudignore",
        "../../lib/launch-updates/cloudbuild.waitlist.yaml",
      ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
    );
  assert.match(dockerfile, /USER node/u);
  assert.match(dockerfile, /src\/public-server\.mjs/u);
  assert.doesNotMatch(dockerfile, /ARG|RESEND_API_KEY/u);
  for (const ignore of [dockerignore, gcloudignore]) {
    assert.match(ignore, /^\*\*$/mu);
    assert.match(ignore, /!Dockerfile\.waitlist/u);
    assert.match(ignore, /!src\/public-server\.mjs/u);
    assert.doesNotMatch(ignore, /!\.env/u);
  }
  assert.match(cloudbuild, /--file=Dockerfile\.waitlist/u);
  assert.match(cloudbuild, /serviceAccount:/u);
  assert.match(cloudbuild, /requestedVerifyOption: VERIFIED/u);
});

test("keeps planning local and deployment separately authorized", async () => {
  const script = "deploy/gcp/activate-public-waitlist-release.sh";
  const output = execFileSync("bash", [script, "--plan"], {
    encoding: "utf8",
  });
  assert.match(output, /CONTROLLED PUBLIC EMAIL WAITLIST PLAN PASS/u);
  assert.match(output, /Cloud or provider state read: no/u);
  assert.match(output, /AUTHORIZED_PUBLIC_WAITLIST_RELEASE/u);
  assert.match(
    output,
    /PLAN COMPLETE — NO CLOUD, DNS, DATABASE, CONTACT, OR EMAIL-SENDING CHANGES/u,
  );

  const rejected = spawnSync("bash", [script, "--destroy"], {
    encoding: "utf8",
  });
  assert.equal(rejected.status, 2);
  assert.match(rejected.stderr, /Usage:/u);
  execFileSync("bash", ["-n", script]);

  const source = await readFile(script, "utf8");
  assert.match(source, /gcloud builds submit/u);
  assert.match(source, /gcloud run deploy/u);
  assert.match(source, /firebase deploy --only hosting/u);
  assert.match(source, /SAMRA_RESEND_CONFIGURATION_CONFIRMED/u);
  assert.match(source, /samra-production-resend-api-key/u);
  assert.match(source, /value\(parent\.id\)/u);
  assert.match(source, /value\(dockerConfig\.immutableTags\)/u);
  assert.match(source, /SOURCE_BUCKET="\$\{PROJECT_ID\}_cloudbuild"/u);
  assert.match(source, /BUILD_SOURCE_ROLE="roles\/storage\.objectViewer"/u);
  assert.match(source, /gcloud projects get-iam-policy/u);
  assert.match(source, /gcloud storage buckets describe/u);
  assert.match(source, /gcloud storage buckets get-iam-policy/u);
  assert.match(source, /allUsers/u);
  assert.match(source, /allAuthenticatedUsers/u);
  assert.match(source, /condition/u);
  assert.match(source, /--concurrency=2/u);
  assert.match(source, /No contact was created and no email was sent/u);
  assert.doesNotMatch(source, / \+\s+--/u);
  assert.doesNotMatch(
    source,
    /sql users create|sql databases create|secrets versions access|firestore databases create|auth:import/iu,
  );
  assert.doesNotMatch(
    source,
    /gcloud projects add-iam-policy-binding|roles\/storage\.(?:admin|objectAdmin|objectUser)/iu,
  );
  const sourceAccessApply = source.indexOf(
    'gcloud storage buckets add-iam-policy-binding "gs://${SOURCE_BUCKET}"',
  );
  const buildSubmit = source.indexOf("gcloud builds submit");
  assert.ok(sourceAccessApply >= 0);
  assert.ok(sourceAccessApply < buildSubmit);
  assert.ok(
    sourceAccessApply >
      source.indexOf("SAMRA_GCP_PUBLIC_WAITLIST_APPLY"),
  );
  assert.match(source, /--member="\$\{BUILD_MEMBER\}"/u);
  assert.match(source, /--role="\$\{BUILD_SOURCE_ROLE\}"/u);
  assert.match(source, /--condition=None/u);

  const legacy = await readFile(
    "deploy/gcp/activate-coming-soon-static-hosting.sh",
    "utf8",
  );
  assert.match(legacy, /superseded by the controlled public waitlist/u);
  assert.match(legacy, /activate-public-waitlist-release\.sh/u);
});
