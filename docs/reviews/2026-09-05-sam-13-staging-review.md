# SAM-13: optional waitlist profile — staging review

Task: https://app.notion.com/p/3d214b3842668176891ae05071d0f0bc
Initial base: `11f45f54efa5673722f0ff8ee885f739c01a843c`.
Integrated main `71951724d9739518f105ab32f7fd15162c6b9232` (SAM-11); retained
both Values-page and signup styles, then reran the frontend build/tests.

## Change

The public form accepts optional first name and mobile number in addition to the
existing required email and explicit email consent. US/Canada and Ethiopia have
national-number entry; Other country requires an international + prefix. Phone
validation checks format, not ownership, reachability or SMS eligibility.
The backend maps new-contact data to `first_name` and `properties.phone_number`.
Existing contacts, including those encountered after a create conflict, never
receive profile updates from this unauthenticated form. Existing segment/topic
behavior is retained; globally unsubscribed contacts receive no mutations.
Blank profile fields are omitted. No SMS, OTP, database or financial flow added.

## Verified locally

- Node 24.15.0; frozen dependency install (pnpm 11.25.0 locally; CI pins 11.19.0).
- Marketing service: 95 tests passed, including malformed profile, create,
  blank fields, existing/unsubscribed contacts, conflict and provider rejection.
- Public frontend: 225 tests passed; production build and public bundle boundary passed.
- Workspace typecheck passed.
- Deployment contracts: 255 tests passed in sandbox; the six loopback tests
  initially hit sandbox EPERM. The entire 14-test proxy suite passed when run
  with loopback access. No application failure remained in that suite.
- Local built-site browser inspection: desktop and 320px form layout passed.
- Read-only Resend UI check: `phone_number`, string, fallback absent, verified
  September 5, 2026. No contact submitted or modified and no email sent.

## Staging and release sequence

1. Review the PR head and require the repository CI, security, static preview
   artifact, and isolated Resend-container checks. Local Docker is unavailable;
   container execution evidence must come from CI before claiming image readiness.
2. Use the static review artifact for visual review. It is not a connected
   Resend staging service. Do not point staging clients at the production API.
3. The existing marketing runtime explicitly requires `samra-pay-production`,
   `samra-launch-updates`, secret version `1`, and the current two production
   origins. This change preserves those guards. A connected cloud staging test
   requires a separately reviewed exact staging project/service/origin contract,
   test segment/topic and credential scope; do not spoof production environment
   identifiers in staging or broaden the origin allowlist to make a test pass.
4. Before any authorized connected release, verify the phone property and exact
   destination, source SHA/image digest, origin, test-contact scope and rollback.
5. Release the backward-compatible backend BEFORE exposing the new frontend.
   Old email-only clients remain valid. The old backend rejects the new optional
   keys, so a frontend-first deployment would fail for populated profiles.
6. Verify a new test contact with populated fields; an email-only signup; invalid
   input; repeat/existing contact handling; unsubscribe preservation; and provider
   failure. Do not copy real contact data into review artifacts.
7. Roll back the frontend first if needed. Keep the compatible backend until new
   frontend clients have drained; already-loaded clients can otherwise still send
   profile keys to an older backend. Do not erase captured contacts on rollback.

## Remaining limits

No merge, cloud build/publication, staging deployment, live provider submission,
or production release occurred in this implementation session. Existing contact
profile enrichment requires a separate authenticated/verified flow. Concurrent
create handling follows the existing provider contract and is tested synthetically;
no live concurrency test has been run.
