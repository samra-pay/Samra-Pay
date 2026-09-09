#!/usr/bin/env bash
# Apply only after approval of these exact build-only IAM grants.
set -euo pipefail
case "${1:-}" in dev|test) environment=$1 ;; *) echo 'Usage: configure-dev-test-build-iam.sh dev|test' >&2; exit 64 ;; esac
project="samra-pay-$environment"
account="samra-build-$environment@$project.iam.gserviceaccount.com"
bucket="$project"_cloudbuild
# All targets must exist before the first permission mutation.
gcloud iam service-accounts describe "$account" --project="$project" --format='value(email)'
gcloud storage buckets describe "gs://$bucket" --format='value(name)'
gcloud artifacts repositories describe "samra-$environment" --project="$project" --location=us-east4 --format='value(name)'
gcloud storage buckets add-iam-policy-binding "gs://$bucket" \
  --member="serviceAccount:$account" --role=roles/storage.objectViewer --quiet
gcloud artifacts repositories add-iam-policy-binding "samra-$environment" \
  --project="$project" --location=us-east4 \
  --member="serviceAccount:$account" --role=roles/artifactregistry.writer --quiet
gcloud projects add-iam-policy-binding "$project" \
  --member="serviceAccount:$account" --role=roles/logging.logWriter --condition=None --quiet
# Read back each resource's policy; these contain identity/role metadata only.
gcloud storage buckets get-iam-policy "gs://$bucket" --format=json
gcloud artifacts repositories get-iam-policy "samra-$environment" --project="$project" --location=us-east4 --format=json
gcloud projects get-iam-policy "$project" --flatten='bindings[].members' \
  --filter="bindings.members:serviceAccount:$account" --format='table(bindings.role,bindings.members)'
