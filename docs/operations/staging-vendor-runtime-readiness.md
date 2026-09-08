# Staging vendor runtime readiness

## Status

This is a preparation and sequencing contract. It does not authorize a vendor
account change, secret creation, secret-version creation, IAM grant, image
publication, Cloud Run deployment, public route, real PII, wallet creation,
funding, balance, remittance, or Replit change.

The approved sequence is:

1. deploy the portable customer-web and API surfaces behind the reviewed Google
   Cloud access boundary;
2. connect Auth0 staging authentication using separate public SPA and Native
   Application identifiers plus exact API issuer/audience values;
3. activate Persona sandbox only after its data and support controls pass;
4. keep the deterministic Crossmint adapter active until the separate
   customer-controlled sandbox lane, credential scope, wallet configuration,
   and operating model pass an independent activation review.

## Samra-owned truth

Auth0 proves a session. Persona provides identity-verification evidence.
Crossmint may provision a wallet. None of them owns Samra's customer,
onboarding state, eligibility, consent, audit trail, ledger, balance, capability
decision, reconciliation exception, or support record.

Every provider identifier remains an opaque mapping to a Samra-owned aggregate.
Provider callbacks are evidence, never direct authority to grant a financial
capability or edit a ledger balance.

## Portable customer web

The customer-web image contains no environment-specific Auth0 identifiers.
Cloud Run's static server exposes `/samra-runtime-config.js` with an exact
allowlist:

| Cloud Run value                | Browser value          | Secret |
| ------------------------------ | ---------------------- | ------ |
| `SAMRA_PUBLIC_DATA_MODE`       | `VITE_SAMRA_DATA_MODE` | no     |
| `SAMRA_PUBLIC_AUTH0_DOMAIN`    | `VITE_AUTH0_DOMAIN`    | no     |
| `SAMRA_PUBLIC_AUTH0_CLIENT_ID` | `VITE_AUTH0_CLIENT_ID` | no     |
| `SAMRA_PUBLIC_AUTH0_AUDIENCE`  | `VITE_AUTH0_AUDIENCE`  | no     |

The response is `no-store`. Partial Auth0 configuration fails startup. The
server ignores all other process variables, including Auth0 secrets, Persona
secrets, Crossmint secrets, and database credentials. Local Vite development
serves an empty fallback and retains its existing build-time defaults.

The same server also owns the private API proxy boundary. These server-only,
non-secret values are never exported to the browser:

| Cloud Run value               | Required value                         |
| ----------------------------- | -------------------------------------- |
| `SAMRA_API_ORIGIN`            | exact HTTPS `samra-api` service origin |
| `SAMRA_API_SERVICE_AUTH_MODE` | `cloud-run-iam`                        |
| `SAMRA_API_SERVICE_AUDIENCE`  | same exact API service origin          |

The proxy preserves the Auth0 customer bearer token in `Authorization`, strips
any browser-supplied `X-Serverless-Authorization`, and adds an audience-bound
Google service identity token from Cloud Run metadata in that second header.
No service-account key is created or stored. The customer-web identity still
requires a future exact service-level `roles/run.invoker` grant and zero-traffic
positive and negative proof before deployment or traffic is authorized.

## Auth0 staging gate

Auth0 requires no browser or native-client secret. The customer-web and native
mobile boundaries are implemented but remain disconnected. Before deployment,
record and review:

- tenant and custom-domain owner;
- separate SPA and Native Application client IDs;
- exact Samra API identifier;
- exact callback, logout, and allowed web-origin inventory;
- exact native iOS bundle ID, Android package, lowercase custom scheme, and
  callback/logout inventory;
- API issuer base URL;
- RS256 signing and JWKS behavior;
- custom development-build and controlled tester-distribution workflow;
- session, incident, account-recovery, deletion, and support owners.

The browser stays PKCE-oriented, uses memory-only token storage, and does not
use refresh tokens. Mobile uses Auth0 Universal Login and SDK-managed iOS
Keychain or Android encrypted storage, resolves a fresh Bearer token for each
API request, and does not request `offline_access`. The default mock build omits
the native module and remains compatible with Expo Go. API mode requires the
complete native configuration and a custom build. The API validates issuer and
audience. No Auth0 management credential is part of either customer runtime.

The reviewed native constants are application ID
`com.samrapay.mobile.staging` and scheme `samrapayauth`. The mobile boundary is
not connected until the separate activation runbook passes. See
[Mobile Auth0 native activation](./mobile-auth0-native-activation.md).

## Persona sandbox gate

Persona remains `prepared-not-authorized`. A later activation may map only:

| Runtime variable                  | Secret Manager object                           |
| --------------------------------- | ----------------------------------------------- |
| `PERSONA_API_KEY`                 | `samra-staging-persona-api-key`                 |
| `PERSONA_WEBHOOK_SECRET`          | `samra-staging-persona-webhook-secret`          |
| `PERSONA_WEBHOOK_SECRET_PREVIOUS` | `samra-staging-persona-webhook-secret-previous` |

Every environment-variable secret reference must use a reviewed numeric
version, never `latest`. The previous webhook secret exists only during a
bounded rotation overlap. Non-secret template and environment identifiers are
ordinary API runtime configuration. Only `samra-api-staging` may receive exact
per-secret access.

Activation remains blocked on the Persona inventory, approved PII field map and
retention policy, support and appeal workflow, zero-traffic synthetic webhook
evidence, restart evidence, and independent post-audit.

## Crossmint adapters and activation boundary

The standard staging deployment contract still uses the deterministic fake
adapter. The older server/external-signer adapter remains dormant. A separate
`CrossmintCustomerSandboxAdapter` is now selectable by
`SAMRA_CUSTOMER_WALLET_PROVIDER_MODE=crossmint-sandbox-customer` with staging,
Auth0, PostgreSQL, one allowlisted customer, and workers/operations disabled.
Migration 0017 supports this guarded mapping. This source capability does not
activate it in the standard staging controller or authorize a provider call.

The separately authorized customer sandbox lane uses:

```text
CROSSMINT_SERVER_API_KEY -> samra-staging-crossmint-server-api-key:<numeric-version>
```

The customer adapter uses the pinned sandbox API, an opaque
`userId:customer_<opaque-id>` owner, stable idempotency, and EVM smart-wallet
creation with the allowlisted tester's email recovery. It has no signing,
transfer, or recovery operation. Server/external/MPC signer options in the
older adapter are not the accepted customer-controlled configuration.
See [connection evidence](crossmint-sandbox-connection.md) for the recorded
console lookup and [deployment package](staging-wallet-deployment-package.md)
for the private API, disclosure, credential, and remaining activation gates.

The server key must have only the reviewed create-wallet scope and must never
appear in web or mobile code. No secret object, secret version, API service
IAM, runtime configuration, provider call, wallet, or public route is
authorized by this implementation.

Before sandbox activation, approve the exact USDC test asset and network,
wallet type, custody and signer model, recovery, credential scopes, webhook
contract, gas policy, customer disclosure, support workflow, idempotency,
timeout and retry behavior, and ledger-to-provider reconciliation design.

## Secret injection rule

Cloud Run retrieves an environment-variable secret before an instance starts.
Google recommends a numeric version instead of `latest` for that injection
mode. Each deployment must therefore record the secret resource and version,
verify the API runtime service identity has access, deploy a zero-traffic
revision, and prove rollback before traffic promotion.

References:

- [Google Cloud Run secret configuration](https://docs.cloud.google.com/run/docs/configuring/services/secrets)
- [Google Cloud Build substitutions](https://docs.cloud.google.com/build/docs/configuring-builds/substitute-variable-values)
- [Auth0 Expo quickstart](https://auth0.com/docs/quickstart/native/react-native-expo)
- [Auth0 React Native SDK](https://github.com/auth0/react-native-auth0)
- [Crossmint backend wallet REST API](https://docs.crossmint.com/wallets/quickstarts/restapi)

## Hard stops

- any plaintext or `latest` vendor-secret reference;
- any vendor credential in GitHub, Docker build arguments, browser or mobile
  bundles, Firebase, logs, screenshots, Qase, or support systems;
- partial Auth0 public configuration;
- a non-loopback API proxy without exact Cloud Run service authentication, or
  a project-wide API invoker grant;
- Persona production mode or real customer PII;
- Crossmint sandbox-adapter activation, wallet creation, token movement, or
  balance display;
- public unauthenticated Cloud Run service or direct default URL;
- provider status directly granting a wallet, funding, remittance, card, or
  ledger capability;
- any claim of staging readiness before Google staging has passed its full
  access, runtime, rollback, and release gates.
