# Runbook: API outage

Status: decision procedure only. No paging or deployment authority is implied.

## Declare and contain

1. Open an incident record and assign an initial severity. Use SEV1 when a
   critical journey is unavailable; use SEV0 if financial integrity, data loss,
   credential compromise, or unauthorized access is suspected.
2. Record the exact revision, environment, first known failure time, affected
   routes, status codes, and whether authentication and database readiness are
   independently healthy.
3. Keep API mode server-authoritative. Never route financial reads or commands
   to mock data because the API is unavailable.
4. Stop new economic commands when database, ledger, authorization, or provider
   state cannot be established. Do not stop unrelated read-only surfaces
   without evidence that they create risk.

## Diagnose

- Separate reachability, revision startup, readiness, authentication,
  authorization, database, ledger, and provider evidence.
- Compare the deployed revision and immutable image identity with the approved
  release evidence. A healthy process on the wrong revision is not recovery.
- Check the earliest error before secondary retries or restart noise.
- Record whether the failure is application-wide, route-specific,
  identity-specific, dependency-specific, or regional. Keep hypotheses labeled.

## Recover and verify

Choose the smallest reviewed action with a defined rollback. Deployment,
traffic, DNS, secret, and provider changes require the corresponding authority.

Before resolving the incident, verify:

- exact revision and image identity;
- unauthenticated and unauthorized requests still fail closed;
- health and readiness succeed independently;
- database connectivity and migration identity are correct;
- a synthetic customer journey does not fall back to mock financial data; and
- ledger and reconciliation checks show no unexplained variance.

Record the outage interval, customer impact, financial exposure, recovery
approval, verification evidence, and remaining risk. Do not claim an SLO result;
no production SLO or measurement source is approved.
