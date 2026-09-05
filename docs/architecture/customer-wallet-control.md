# Customer-initiated wallet control

Decision: customer initiates and approves every outgoing alpha transfer.
Recorded 2026-09-04. This supersedes the previously undecided custody options
in the Crossmint sandbox adapter. It does not select the future Rain account
or card program, a production network, or a regulated custody arrangement.

## Selected direction

Customer wallets are EVM smart wallets with customer passkey transaction
signing and customer-controlled recovery. Samra must not hold a customer
operational or recovery signer. No MPC, global external-wallet signer,
server signer, silent device signing, automatic debits, standing approvals,
or background retries are allowed in the customer transfer path.

The selected customer-control requirement is firm. Email OTP is the proposed
recovery implementation; production suitability and the loss of both email
and passkey still need review. Crossmint recovery signers can themselves sign
transfers. Consequently, this is a policy for Samra-originated transfers, not
a claim that the wallet contract prohibits every alternative customer signing
path. Samra account suspension does not freeze independently controlled assets.

## What this change implements

- The dormant server adapter accepts only a smart-wallet customer recovery
  configuration. The previously accepted server/MPC/global signer paths fail
  before a provider request.
- Recovery is resolved per opaque customer owner, not once for the entire
  adapter. Resolver failure and mismatched customer identity fail closed.
- The resolver is an internal dependency, not a client-supplied assertion.
  Its eventual persistence implementation must use verified, consented customer
  enrollment, bind it immutably to the wallet request, and reject recovery
  changes on retry. No concrete resolver or runtime wiring is included here.
- Creation checks the returned recovery identity, rejects unexpected extra
  signers, and emits `smart-customer-recovery-pending-passkey`. This is not proof
  of passkey enrollment or readiness to send.
- The request is snapshotted before loading recovery enrollment, so caller
  mutation cannot change the owner or idempotency reference during that wait.
  Response bodies are bounded while streaming, including responses without a
  declared content length.
- A shared, transport-independent approval coordinator snapshots all displayed
  transfer details, customer/wallet identity, passkey ID, exact transaction
  digest, and expiry. Cancellation, changed details, expiry, double clicks,
  and repeat submission cannot call its signing transport. Ambiguous transport
  failures require reconciliation rather than an automatic retry.
  Invalid clocks and incomplete reviews fail closed. The helper is available
  through `@workspace/samra-client/wallet-approval` without adding a runtime
  provider dependency.

The coordinator is not cryptographic enforcement. It is not wired to a UI,
HTTP route, or Crossmint SDK. A new coordinator instance does not prevent replay
across refreshes or processes; the eventual durable backend intent and provider
idempotency reference must do that. A boolean from this coordinator must never
be accepted as server-side proof of approval.

## Enrollment and activation work still required

1. Resolve a verified customer recovery identity after Auth0 authentication,
   durable consent, and the existing Persona/eligibility gate. Never create a
   wallet automatically just because an SDK user logged in.
2. Obtain customer consent for Crossmint receiving the recovery email. This
   intentionally extends the old opaque-only provider request policy. Keep
   the opaque owner reference; exclude recovery email from wallet mappings,
   audit metadata, application logs, and exceptions. No real email is sent by
   this PR; tests use reserved `.test` addresses.
3. Create/reconcile the recovery wallet under one durable request identity.
   Enroll the customer passkey using a client SDK and customer recovery approval.
   Verify signer identity and onchain installation before marking it usable.
   Auth0 login alone is not wallet approval. Client key scopes, JWT restrictions,
   and origin allowlists need their own reviewed configuration.
4. Pin and verify a web/mobile SDK version. Explicitly select the enrolled
   passkey before each transfer. Reject silent device, server, or recovery
   fallback. Restore and verify this choice after device recovery.
5. Persist a single-use transfer intent. Bind recipient, source wallet, customer,
   chain ID, token contract/decimals, exact integer amount, all fees, nonce,
   expiry, and encoded transaction hash to the customer review and signature.
   Verify the prepared transaction against that record before invoking the
   signer and verify the signed payload before submission. No display-only
   amount or passkey presence flag constitutes authorization.
6. Test cancellation at the actual authenticator, fee/recipient mutation,
   cross-customer and cross-wallet replay, concurrent submissions, page reload,
   timeout after broadcast, signer removal, and lost-device recovery. Preserve
   the same intent for ambiguous-outcome reconciliation.
7. Choose and approve the exact test network and asset. Update the existing
   synthetic-only database/runtime constraints in a separate reviewed change
   only after the sandbox evidence passes. No network has been selected here.

## Evidence and limits

Repository base: `34fb5fc0e31d7c38106b623e68482130fc63377d`.
Existing runtime and PostgreSQL wallet store remain synthetic-only. No cloud
secrets, IAM, credentials, routes, real wallets, or transfers are activated.
The preceding console task recorded a staging key with only `wallets.create`.
Console access could not be reverified during this continuation because the
browser could not verify the admin-enforced security policy. The recorded key
is not a passkey, customer signature, or permission to move funds.

Official documentation checked 2026-09-04:

- [Recovery configuration](https://docs.crossmint.com/wallets/guides/signers/configure-recovery)
- [Passkey enrollment](https://docs.crossmint.com/wallets/guides/signers/add-signers)
- [Custody and recovery authority](https://docs.crossmint.com/wallets/concepts/custody-models)
- [Create wallet and idempotency](https://docs.crossmint.com/api-reference/wallets/create-wallet)

The documentation's REST create config is loosely typed. Mock contract tests
are not vendor certification. Confirm actual sandbox responses, approved
customer enrollment, and passkey/recovery behavior before activation.

## Local validation

- Adapter contract suite: 10/10 passed (mock HTTP responses only).
- Shared client suite: 29/29 passed, including 10 approval coordinator tests.
- Backend suite: 60/60 passed; JUnit helper suite: 3/3 passed.
- Staging runtime contract and preflight suites: 16/16 passed.
- Referenced library build, shared client typecheck, API typecheck, and API
  production build passed in the isolated checkout.
- Required GitHub CI must pass on the proposed commit before merge.
- Actual passkey enrollment, authenticator cancellation, lost-device recovery,
  durable replay prevention, and real provider calls are not exercised here.
