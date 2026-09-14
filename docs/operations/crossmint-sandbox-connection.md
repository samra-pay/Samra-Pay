# Crossmint sandbox connection evidence

## Verified on 2026-09-04 America/New_York

Repository baseline: `34fb5fc0e31d7c38106b623e68482130fc63377d`.

The Crossmint staging project `Samra Pay Alpha`
(`37534d23-c753-497f-817b-7250ce062c41`) now has a console-created test wallet:

- Owner: `userId:samra-sandbox-wallet-001` (synthetic console test identity).
- Alias entered at creation: `samra-sandbox-001`.
- Address: `0x330428ec8d5e850354b1c16f5af354e0443a1677`.
- EVM smart wallet, with the console's user-wallet/email-recovery configuration.
- The console displayed 0.00 USD and 0.00 EUR after creation.
- No funding, transfer, transaction signing, or recovery test was performed.

An authenticated server-side GET from the local Node runner returned HTTP 200.
The server verified the exact address, owner, chain type and wallet type against
the Crossmint response. Only the allowlisted normalized evidence was printed.
The existing staging key was provided through non-echoing process input, not
written to a file, repository, argument, or report. The first sandboxed attempt
failed DNS resolution; the network-enabled read succeeded.

This proves authenticated server-to-provider lookup. It does not prove a
deployed Samra API connection, a PostgreSQL mapping, onboarding, webhook delivery,
recovery, or money movement. The synthetic console identity is not a Samra
`customer_<opaque-id>` and must not be attached to a customer by bypassing the
authenticated onboarding, consent, and identity gates.

## Repeat the lookup

Use Node 24 or later:

```sh
node --test artifacts/api-server/test/crossmint-sandbox-read.test.mjs
node artifacts/api-server/test/crossmint-sandbox-connection.mjs \
  0x330428ec8d5e850354b1c16f5af354e0443a1677 \
  userId:samra-sandbox-wallet-001
```

The second command accepts the existing staging server key on standard input;
terminal input is non-echoing. Do not pass the key as a command argument or put
it in shell history. Automated invocations should pipe from an approved secret
source. It performs exactly one GET, rejects redirects and production/client
keys, bounds the response, verifies ownership, and never writes database state.

## Approved signing choice and follow-up evidence

David selected customer-controlled signing on 2026-09-04. The intended model is
a customer device or passkey operational signer and customer-controlled email
recovery. Samra must not receive a server signer, recovery signer, or delegated
transaction-signing authority as part of this connection.

A second authenticated GET verified the exact wallet owner and EVM smart-wallet
address, plus `config.adminSigner.type = email` and the expected recovery email.
The email and provider response were not printed. This is recovery configuration
evidence only: no operational signer inventory, device enrollment, recovery
exercise, or transaction approval was verified.

Crossmint's device signer can sign silently. Customer control of keys does not
automatically create an approval screen for each transaction. Before requesting
a signature, Samra's future transaction UI must present and bind the exact
network, asset, amount, destination, fees, and expiry to an explicit customer
confirmation. Changing those fields invalidates confirmation. Background
workers must not invoke customer signing.

The lookup runner's optional `--customer-controlled` mode takes a JSON object
with `apiKey` and `expectedRecoveryEmail` through non-echoing standard input. It
rejects server/external/MPC recovery, a changed email, and missing recovery
evidence. It deliberately reports operational signer and approval verification
as false; email recovery alone does not establish the complete custody model.
The six connection/recovery tests and three existing JUnit compatibility tests
passed in this follow-up (nine targeted tests total).

## Backend implementation prepared

The new `CrossmintCustomerSandboxAdapter` implements EVM smart-wallet creation
with the allowlisted tester's email recovery. It has no signing, transfer, or
recovery method. The older server/external-signer adapter remains dormant.
An existing wallet address must not be used as an external signer.

`SAMRA_CUSTOMER_WALLET_PROVIDER_MODE` defaults to `fake`. The opt-in value
`crossmint-sandbox-customer` requires staging, Auth0 authentication, PostgreSQL,
one opaque Samra customer ID, a staging server key, and the tester's recovery
email. Workers, internal operations, and development controls are disabled.
Only the exact configured customer can provision. Identity approval and the
separate current `sandbox-customer-wallet-v2` disclosure must precede creation.

Migration `0017_customer_controlled_sandbox_wallets` separates staging from
synthetic configurations and validates new provider mappings with a database
trigger. Migration `0021_customer_wallet_control_setup` separates provider
resource creation from customer-control readiness and corrects earlier staging
rows that were labeled ready. Existing mappings remain immutable. Startup
readiness checks require the sandbox, mapping, and customer-control constraints.
A valid legacy staging row must reference the exact v1 disclosure and mapping
before migration; 0019 preserves that evidence but does not promote it to
current acceptance. Returning testers append current base and wallet v2 consent
without replacing the old rows or redispatching a completed create.
A changed idempotency command or provider configuration is rejected; a
conflicting provider result restricts the wallet. A created sandbox resource
returns wallet `customer_control_setup`, onboarding `wallet_control_setup`,
`readyAt: null`, a withheld customer-facing address and custody/control label,
and `await_customer_control_setup`. It is not permission to fund or transfer.
The adapter sends a stable idempotency key but has no provider retrieval or
reconciliation method. A transport timeout can therefore leave the upstream
outcome ambiguous; do not automatically reissue creation until the original
outcome is reconciled through a separately verified provider path.

This is backend provisioning only. Web and mobile retrieve the active
non-production disclosure from Samra before provisioning; neither client can
select the provider mode or claim customer-control completion. Client device
enrollment, client JWT trust, recovery verification, and an explicit
transaction-confirmation interface remain outside the implemented backend
creation path. No financial capability is enabled by this change.

### Bounded activation prerequisites

1. Review and test the exact code revision, including PostgreSQL integration
   tests and the migration; apply through the existing controlled staging release.
2. Verify the private staging API, Auth0 issuer/audience, database access, and
   the tester's authenticated `customer_<32 lowercase hex>` identity. Confirm its
   Samra identity case is approved; do not fabricate production KYC evidence.
3. Provide a scoped staging server key through a pinned numeric Secret Manager
   version. Configure `SAMRA_DEPLOYMENT_ENVIRONMENT=staging`,
   `SAMRA_RELEASE_PROFILE=alpha-release-1`, an exact reviewed
   `SAMRA_ALLOWED_ORIGINS` list with no wildcard,
   `SAMRA_CUSTOMER_WALLET_PROVIDER_MODE=crossmint-sandbox-customer`,
   `CROSSMINT_SANDBOX_CUSTOMER_ID`, and `CROSSMINT_SANDBOX_RECOVERY_EMAIL`.
   Supply `CROSSMINT_SERVER_API_KEY` by secret reference, never in frontend code.
4. Call authenticated `GET /api/v1/onboarding/wallet/disclosure`. The current
   clients deliberately accept only a complete response that exactly matches
   their compiled disclosure allowlist, then render the validated canonical
   presentation and submit the corresponding allowlisted version tuple with
   `decision: accepted` and a stable `Idempotency-Key`. This pin is a fail-closed
   contract check, not client authority to select provider mode or alter the
   disclosure. Do not bypass it with an operator-authored request body.
5. Verify owner/address/recovery configuration through the bounded
   server/provider evidence path and verify the immutable PostgreSQL mapping,
   conclusive local replay, process restart, audit trail, and absence of funds
   or signing authority. A timeout without a persisted mapping or a separately
   verified provider result is ambiguous: stop and reconcile it instead of
   issuing another create request. The customer response must remain
   `customer_control_setup` with no address or readiness claim. Treat the
   console test owner as a separate test wallet. Record this as a generic EVM
   smart-wallet resource, not a verified USDC wallet; the create request does
   not select or validate an asset contract or exact chain.
6. Configure client JWT ownership mapping and scoped client access only after
   review. The tester must complete device/recovery enrollment personally.

Rollback: disable the sandbox wallet mode and stop provisioning traffic. Preserve
wallet, consent, mapping, and audit records. Do not replace a staging mapping
with a synthetic mapping or destructively roll back migration 0017 or 0019.

### Local validation

The counts below preserve the 2026-09-04 implementation evidence. They are not
a current release result; rerun the full current journal and release gates for
the candidate SHA.

- At the time of this 2026-09-04 evidence capture, the API suite had 60 passing
  tests, plus nine connection-reader/JUnit tests. The HTTP
  tests required temporary localhost listeners outside the filesystem sandbox.
- API TypeScript check, shared-library TypeScript build/checks, OpenAPI
  generation, compiled API build, and migration policy passed at that baseline
  (18 migrations).
- The generated-contract drift check, 11 database unit tests, and all 255
  deployment-boundary/static-server tests passed. No cloud resources were changed
  by these tests.
- The new persistence test ran against all 18 migrations in PostgreSQL 18.3
  via PGlite 0.5.8, using a temporary serialized pool adapter. Consent, ownership,
  retries, durable reads through a new store, mapping conflict, invalid mapping,
  disabled-trigger readiness, and mid-provisioning restriction checks passed.
  This is SQL/store validation, not a deployed connection, process-restart
  proof, or multi-connection PostgreSQL concurrency proof.
- The same persistence test is included in the existing PostgreSQL HTTP CI suite
  for validation with the repository's normal PostgreSQL service. That CI result
  must be verified before release.

The native disposable PostgreSQL 16 process could not start locally: its initial
`initdb` process was terminated and the subsequent executable was unavailable.
No shared or cloud database was used as a substitute.

Webhooks require an independently verified receiver and signing contract; no
endpoint was configured during this test.

The Crossmint console lists one scoped server key with `wallets.create`, no
scoped client keys, and the JWT authentication configuration controls. Existing
development keys have full staging access and are not the credential design for
the deployed customer integration. No keys, JWT trust settings, or permissions
were changed during this follow-up.

Crossmint's bring-your-own-auth flow derives the wallet owner from JWT identity.
Samra currently requires `userId:customer_<opaque-id>`, not a raw Auth0 subject.
Resolve that identity mapping before configuring direct Auth0 trust or issuing
client wallet sessions. Do not attach this manually named console test owner to
a Samra customer to work around the mismatch.

## Verified staging deployment inventory

David explicitly approved read-only inspection using the already signed-in
`me@davidhaile.com` account. The approved switch succeeded. The Cloud Console
confirmed `Samra Pay Staging` (`samra-pay-staging`) and that account. Its Cloud
Run Services page had no service rows, no applied filter, and the initial
"Get started by creating a service" state. No permission error was present.

There is no deployed Cloud Run API service in this staging project to attach
the wallet to. The backend connection remains a local authenticated provider
lookup, not a cloud runtime connection.

A subsequent read-only Cloud SQL inspection confirmed the existing
`samra-staging-postgres` instance, PostgreSQL 16.14, in `us-east4-c`. It is runnable,
single-zone, with 1 vCPU, 1.7 GB memory, and 10 GB SSD. Public IP connectivity is
disabled; private IP is `10.41.0.3` on `samra-staging-vpc`. Automated backups,
point-in-time recovery, and deletion prevention are enabled. The console flags
"Allows unencrypted direct connections". Verify enforced encrypted transport
and the least-privilege database identities before attaching the runtime.
No SQL contents, migration history, database credentials, secret versions, or
Auth0 tenant state were inspected. No database settings were changed.

The earlier denial under `david@samrapay.com` and account-switch approval block
are resolved for this approved inspection. No IAM changes, key creation,
deployment, billing changes, or traffic promotion occurred.

The next release needs the prepared customer-controlled backend code and a
private staging API deployment. The cloud database migrations have not been
applied. Complete the identity mapping, customer signer/recovery flow, scoped
credentials, and authenticated onboarding/replay verification. The disclosure
retrieval and setup-required client state now exist in code, but they have not
been exercised in a deployed staging journey. Use the repository's staging
release controls for database readiness, immutable images, zero-traffic
verification, cost review, rollback, and any subsequent traffic approval.

Sources:

- [Crossmint staging wallet console](https://staging.crossmint.com/console/wallets)
- [Verified staging Cloud Run Services](https://console.cloud.google.com/run/services?authuser=1&project=samra-pay-staging)
- [Verified staging Cloud SQL instance](https://console.cloud.google.com/sql/instances/samra-staging-postgres/overview?authuser=1&project=samra-pay-staging)
- [Get wallet by locator](https://docs.crossmint.com/api-reference/wallets/get-wallet-by-locator)
- [Crossmint device signer](https://docs.crossmint.com/wallets/guides/signers/device-signer)
- [Crossmint bring-your-own-auth](https://docs.crossmint.com/wallets/guides/bring-your-own-auth)
- [Existing Samra wallet boundary](../architecture/customer-wallet-crossmint.md)
- [Staging vendor runtime sequence](./staging-vendor-runtime-readiness.md)
