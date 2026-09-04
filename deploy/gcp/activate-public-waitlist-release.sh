#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="${1:---plan}"

if [[ "${MODE}" != "--plan" && "${MODE}" != "--review" && "${MODE}" != "--apply" ]]; then
  echo "Usage: $0 [--plan|--review|--apply]" >&2
  exit 2
fi

VALIDATED="$(node "${ROOT_DIR}/deploy/gcp/validate-coming-soon-static-hosting.mjs" 2>&1)" || {
  echo "${VALIDATED}" >&2
  exit 1
}

if [[ "${MODE}" == "--plan" ]]; then
  printf '%s\n' "${VALIDATED}"
  cat <<'PLAN'
CONTROLLED PUBLIC EMAIL WAITLIST PLAN PASS
Cloud or provider state read: no
State changed: no

This release enables one public email field and one same-origin endpoint. The
endpoint can read or create Resend Contacts only. It has no Samra database,
account, KYC, wallet, remittance, card-application, or automatic-email path.
An existing unsubscribed contact is never resubscribed.

The Cloud Run service scales to zero and is limited to one instance. Expected
incremental cost is USD 0 at low waitlist volume within provider allowances;
usage is billable and this is not a spending cap. The existing guarded estimate
remains USD 81.92 and the USD 100 total-estimate hard stop remains in force.

Review requires the exact Git SHA, a clean tree, the production identity, the
Resend segment and topic UUIDs, and manual confirmation that the pinned secret
contains a full-access key. Apply additionally requires
AUTHORIZED_PUBLIC_WAITLIST_RELEASE. DNS is never changed by this controller.

PLAN COMPLETE — NO CLOUD, DNS, DATABASE, CONTACT, OR EMAIL-SENDING CHANGES
PLAN
  exit 0
fi

for required_command in gcloud firebase node git pnpm curl; do
  command -v "${required_command}" >/dev/null 2>&1 || {
    echo "${required_command} is required; run this from authenticated Google Cloud Shell." >&2
    exit 1
  }
done

: "${SAMRA_GCP_PROJECT_ID:=samra-pay-production}"
: "${SAMRA_GCP_PROJECT_NUMBER:=382465561715}"
: "${SAMRA_GCP_ORGANIZATION_ID:=614833350075}"
: "${SAMRA_GCP_OPERATOR_ACCOUNT:=}"
: "${SAMRA_GCP_EXPECTED_SHA:=}"
: "${SAMRA_RESEND_SEGMENT_ID:=}"
: "${SAMRA_RESEND_TOPIC_ID:=}"
: "${SAMRA_RESEND_CONFIGURATION_CONFIRMED:=}"
: "${SAMRA_GCP_PUBLIC_WAITLIST_APPLY:=}"

export SAMRA_GCP_PROJECT_ID SAMRA_GCP_PROJECT_NUMBER
export SAMRA_GCP_ORGANIZATION_ID SAMRA_GCP_OPERATOR_ACCOUNT
export SAMRA_GCP_EXPECTED_SHA SAMRA_RESEND_SEGMENT_ID SAMRA_RESEND_TOPIC_ID
export SAMRA_GCP_PUBLIC_WAITLIST_APPLY

PROJECT_ID="${SAMRA_GCP_PROJECT_ID}"
PROJECT_NUMBER="${SAMRA_GCP_PROJECT_NUMBER}"
OPERATOR="${SAMRA_GCP_OPERATOR_ACCOUNT}"
EXPECTED_SHA="${SAMRA_GCP_EXPECTED_SHA}"
REGION="us-east4"
SERVICE="samra-launch-updates"
RUNTIME_SERVICE_ACCOUNT_ID="samra-launch-updates"
RUNTIME_SERVICE_ACCOUNT="${RUNTIME_SERVICE_ACCOUNT_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
BUILD_SERVICE_ACCOUNT="samra-cloud-build-production@${PROJECT_ID}.iam.gserviceaccount.com"
REPOSITORY="samra-production"
SECRET="samra-production-resend-api-key"
SECRET_VERSION="1"
IMAGE_BASE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${SERVICE}"
IMAGE_TAG="${IMAGE_BASE}:${EXPECTED_SHA}"
SITE_ID="samra-pay-production"
PUBLIC_URL="https://${SITE_ID}.web.app"
CANONICAL_URL="https://www.samrapay.com"
RESEND_CONFIRMATION="CONFIRMED_RESEND_SEGMENT_TOPIC_AND_FULL_ACCESS_KEY"

[[ "${SAMRA_RESEND_CONFIGURATION_CONFIRMED}" == "${RESEND_CONFIRMATION}" ]] || {
  echo "STOP: confirm the exact Resend segment, topic, and full-access key before review" >&2
  exit 1
}
if [[ "${MODE}" == "--review" && -n "${SAMRA_GCP_PUBLIC_WAITLIST_APPLY}" ]]; then
  echo "STOP: apply authorization is not accepted during review" >&2
  exit 1
fi

ACTIVATION_INPUT="$(
  SAMRA_GCP_PUBLIC_WAITLIST_APPLY="" node --input-type=module -e '
    const module = await import(process.argv[1]);
    process.stdout.write(JSON.stringify(module.validateStaticHostingEnvironment(process.env)));
  ' "file://${ROOT_DIR}/deploy/gcp/validate-coming-soon-static-hosting.mjs"
)"

[[ "$(gcloud config get-value account 2>/dev/null)" == "${OPERATOR}" ]] || {
  echo "STOP: wrong Google account" >&2
  exit 1
}
[[ "$(gcloud config get-value project 2>/dev/null)" == "${PROJECT_ID}" ]] || {
  echo "STOP: wrong Google Cloud project" >&2
  exit 1
}
[[ "$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')" == "${PROJECT_NUMBER}" ]] || {
  echo "STOP: wrong Google Cloud project number" >&2
  exit 1
}
[[ "$(gcloud projects describe "${PROJECT_ID}" --format='value(parent.type)')" == "organization" && \
  "$(gcloud projects describe "${PROJECT_ID}" --format='value(parent.id)')" == "${SAMRA_GCP_ORGANIZATION_ID}" ]] || {
  echo "STOP: wrong Google Cloud organization" >&2
  exit 1
}
[[ "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${EXPECTED_SHA}" ]] || {
  echo "STOP: source commit does not match the reviewed SHA" >&2
  exit 1
}
[[ -z "$(git -C "${ROOT_DIR}" status --porcelain)" ]] || {
  echo "STOP: source working tree is not clean" >&2
  exit 1
}
[[ ! -e "${ROOT_DIR}/.firebaserc" ]] || {
  echo "STOP: project aliases are not allowed for this production release" >&2
  exit 1
}

pnpm --dir "${ROOT_DIR}" --filter @workspace/samra-pay run build
node "${ROOT_DIR}/artifacts/samra-pay/scripts/check-public-build.mjs" \
  "${ROOT_DIR}/artifacts/samra-pay/dist/public"
node --test "${ROOT_DIR}"/lib/launch-updates/src/*.test.mjs
[[ -z "$(git -C "${ROOT_DIR}" status --porcelain)" ]] || {
  echo "STOP: the verified build changed tracked release source" >&2
  exit 1
}

for api in artifactregistry.googleapis.com cloudbuild.googleapis.com iam.googleapis.com run.googleapis.com secretmanager.googleapis.com; do
  [[ "$(gcloud services list --enabled --project "${PROJECT_ID}" \
    --filter="config.name=${api}" --format='value(config.name)')" == "${api}" ]] || {
    echo "STOP: required API is not enabled: ${api}" >&2
    exit 1
  }
done

[[ "$(gcloud artifacts repositories describe "${REPOSITORY}" \
  --project="${PROJECT_ID}" --location="${REGION}" \
  --format='value(dockerConfig.immutableTags)')" == "True" ]] || {
  echo "STOP: production artifact repository is missing or tags are mutable" >&2
  exit 1
}
gcloud iam service-accounts describe "${BUILD_SERVICE_ACCOUNT}" \
  --project="${PROJECT_ID}" --format=json >/dev/null
[[ -z "$(gcloud iam service-accounts keys list \
  --iam-account="${BUILD_SERVICE_ACCOUNT}" --project="${PROJECT_ID}" \
  --managed-by=user --format='value(name)')" ]] || {
  echo "STOP: production build identity has a user-managed key" >&2
  exit 1
}
gcloud secrets describe "${SECRET}" \
  --project="${PROJECT_ID}" --format=json >/dev/null
SECRET_STATE="$(gcloud secrets versions describe "${SECRET_VERSION}" \
  --secret="${SECRET}" --project="${PROJECT_ID}" --format='value(state)')"
[[ "${SECRET_STATE}" == "ENABLED" ]] || {
  echo "STOP: pinned Resend secret version 1 is not enabled" >&2
  exit 1
}

RUNTIME_IDENTITY_STATE="missing"
if gcloud iam service-accounts describe "${RUNTIME_SERVICE_ACCOUNT}" \
  --project="${PROJECT_ID}" --format=json >/dev/null 2>&1; then
  RUNTIME_IDENTITY_STATE="ready"
  [[ -z "$(gcloud iam service-accounts keys list \
    --iam-account="${RUNTIME_SERVICE_ACCOUNT}" --project="${PROJECT_ID}" \
    --managed-by=user --format='value(name)')" ]] || {
    echo "STOP: waitlist runtime identity has a user-managed key" >&2
    exit 1
  }
fi

SERVICE_STATE="missing"
if SERVICE_JSON="$(gcloud run services describe "${SERVICE}" \
  --project="${PROJECT_ID}" --region="${REGION}" --format=json 2>/dev/null)"; then
  SERVICE_STATE="$(
    printf '%s' "${SERVICE_JSON}" | node -e '
      let input = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => { input += chunk; });
      process.stdin.on("end", () => {
        const labels = JSON.parse(input).metadata?.labels ?? {};
        if (
          labels["samra-component"] !== "public-waitlist" ||
          labels.environment !== "production"
        ) process.exit(2);
        process.stdout.write("owned");
      });
    '
  )" || {
    echo "STOP: an unowned service already uses the name ${SERVICE}" >&2
    exit 1
  }
fi

printf '%s\n' "${VALIDATED}"
printf '%s\n' "${ACTIVATION_INPUT}"
echo "READ-ONLY PUBLIC WAITLIST REVIEW PASS"
echo "Source: ${EXPECTED_SHA}"
echo "Project: ${PROJECT_ID} (${PROJECT_NUMBER})"
echo "Resend secret: pinned version 1 enabled; payload not read"
echo "Runtime identity: ${RUNTIME_IDENTITY_STATE}"
echo "Cloud Run service: ${SERVICE_STATE}"
echo "Build: website and waitlist tests passed"
echo "Boundary: email only; no database or automatic email sending"
echo "Expected incremental monthly cost: USD 0 at low volume; usage dependent"

if [[ "${MODE}" == "--review" ]]; then
  echo "REVIEW COMPLETE — NO CLOUD, DNS, DATABASE, CONTACT, OR EMAIL-SENDING CHANGES"
  exit 0
fi

node --input-type=module -e '
  const module = await import(process.argv[1]);
  module.validateStaticHostingEnvironment(process.env, {
    requireApplyAuthorization: true,
  });
' "file://${ROOT_DIR}/deploy/gcp/validate-coming-soon-static-hosting.mjs"

if [[ "${RUNTIME_IDENTITY_STATE}" == "missing" ]]; then
  gcloud iam service-accounts create "${RUNTIME_SERVICE_ACCOUNT_ID}" \
    --project="${PROJECT_ID}" \
    --display-name="Samra public waitlist" \
    --description="Email-only Resend Contacts service; no database or financial runtime" \
    --quiet
fi
[[ -z "$(gcloud iam service-accounts keys list \
  --iam-account="${RUNTIME_SERVICE_ACCOUNT}" --project="${PROJECT_ID}" \
  --managed-by=user --format='value(name)')" ]] || {
  echo "STOP: waitlist runtime identity has a user-managed key" >&2
  exit 1
}

gcloud secrets add-iam-policy-binding "${SECRET}" \
  --project="${PROJECT_ID}" \
  --member="serviceAccount:${RUNTIME_SERVICE_ACCOUNT}" \
  --role=roles/secretmanager.secretAccessor \
  --condition=None --quiet >/dev/null

gcloud builds submit "${ROOT_DIR}/lib/launch-updates" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --config="${ROOT_DIR}/lib/launch-updates/cloudbuild.waitlist.yaml" \
  --substitutions="_IMAGE=${IMAGE_TAG},_BUILD_SERVICE_ACCOUNT=${BUILD_SERVICE_ACCOUNT}"

IMAGE_DIGEST="$(gcloud artifacts docker images describe "${IMAGE_TAG}" \
  --project="${PROJECT_ID}" --format='value(image_summary.digest)')"
[[ "${IMAGE_DIGEST}" =~ ^sha256:[0-9a-f]{64}$ ]] || {
  echo "STOP: immutable waitlist image digest could not be resolved" >&2
  exit 1
}
IMAGE="${IMAGE_BASE}@${IMAGE_DIGEST}"

gcloud run deploy "${SERVICE}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --image="${IMAGE}" \
  --service-account="${RUNTIME_SERVICE_ACCOUNT}" \
  --ingress=all \
  --allow-unauthenticated \
  --min-instances=0 \
  --max-instances=1 \
  --concurrency=2 \
  --timeout=10s \
  --cpu=1 \
  --memory=256Mi \
  --set-env-vars="SAMRA_LAUNCH_UPDATES_MODE=waitlist,SAMRA_CLOUD_PROJECT_ID=${PROJECT_ID},SAMRA_RESEND_SECRET_VERSION=${SECRET_VERSION},SAMRA_RESEND_SEGMENT_ID=${SAMRA_RESEND_SEGMENT_ID},SAMRA_RESEND_TOPIC_ID=${SAMRA_RESEND_TOPIC_ID}" \
  --set-secrets="RESEND_API_KEY=${SECRET}:${SECRET_VERSION}" \
  --labels="samra-component=public-waitlist,environment=production,data_classification=email-marketing-contact" \
  --quiet

SERVICE_URL="$(gcloud run services describe "${SERVICE}" \
  --project="${PROJECT_ID}" --region="${REGION}" --format='value(status.url)')"
[[ "$(curl --fail --silent --show-error --max-time 30 \
  "${SERVICE_URL}/healthz")" == '{"status":"ok"}' ]] || {
  echo "STOP: Cloud Run health verification failed; hosting was not changed" >&2
  exit 1
}

firebase deploy --only hosting --project "${PROJECT_ID}" --non-interactive \
  -m "Samra Pay controlled public waitlist release ${EXPECTED_SHA}"

for host in "${PUBLIC_URL}" "${CANONICAL_URL}"; do
  STATUS="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
    --max-time 30 "${host}/api/v1/waitlist/subscriptions")"
  [[ "${STATUS}" == "405" ]] || {
    echo "STOP: ${host} did not route the waitlist endpoint (HTTP ${STATUS})" >&2
    exit 1
  }
done

echo "PUBLIC WAITLIST INFRASTRUCTURE APPLIED AND ROUTE VERIFIED"
echo "Source: ${EXPECTED_SHA}"
echo "Image: ${IMAGE}"
echo "No contact was created and no email was sent by this controller."
echo "Final manual gate: submit one approved synthetic address through www.samrapay.com,"
echo "then verify it appears in the exact Resend segment and topic with opt-in status."
