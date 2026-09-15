# Web account entry and Auth0 handoff

Status: implementation for review. Default public builds keep the customer
handoff disabled. This change does not configure Auth0, publish the website,
activate an API, or create real customers.

## Entry paths

- The public website has `/signup` and `/login` pages using its existing
  typography, colors, and English/Amharic language preference. It never loads
  the Auth0 SDK or accepts credentials. Without a configured customer service,
  these pages explain that access is not open and link to launch updates.
- `VITE_SAMRA_CUSTOMER_APP_URL` is an optional, build-time HTTPS application
  base URL. A valid value enables header/mobile-navigation entry links and
  explicit handoffs to `<base>/signup` and `<base>/login`. No query, fragment,
  or referrer is forwarded. Credentials, query strings, fragments, unsafe
  paths, and same-location loops are rejected. This is a public identifier,
  never a secret.
- The existing `SAMRA_WEB_SURFACE=legacy` customer build handles `/signup`,
  `/login`, and OAuth callbacks itself. The registered application-root
  callback must not be intercepted by the public homepage loader.
- Signup requests Auth0 Universal Login with `screen_hint=signup`; login uses
  the default login experience. Both return through `/session`.
- Connected login explains invitation eligibility and provides a password
  recovery entry. It requests `prompt=login` so the customer can select
  Auth0's hosted Forgot password flow. This parameter is a UI hint, not a
  security proof of reauthentication. Google users recover with Google.
  No password, email, reset ticket or provider error detail is collected here.
- `/session` reads the caller's durable onboarding record from Samra. A fresh
  saved record leads to `/account`, including while consent or KYC is pending.
  It does not call the financially gated `/me` endpoint or send an incomplete
  account to the financial dashboard. An unbound identity leads to onboarding.
  Restricted customers,
  authentication errors, and network failures show a retry/logout state.
  There is no automatic customer creation or financial activation on login.
- `/account` shows a masked reference to that saved Samra customer and allows
  refresh, returning to setup and logout. It offers the existing read-only wallet
  route only after the saved onboarding state permits it. Refresh, denied access,
  provider failure and logout hide cached account details. The page never creates
  a customer, starts KYC, provisions a wallet or submits a funding order.
- In the default mock customer build, login opens the synthetic dashboard and
  signup opens synthetic onboarding, with an explicit demo disclosure.
- Public analytics excludes `/login` and `/signup`. OAuth callback parameters
  are removed by the SDK bridge; callback failure returns to `/login`.
- Logout clears customer queries and mutation results before the redirect,
  discards late query results and retires pending token lookups. The same
  cleanup applies when beginning a sign-in handoff or ending the auth bridge.
  Each session has its own query client, so an already-dispatched mutation's
  late callback cannot populate a subsequent session's cache.
  A failed provider redirect leaves a closed local session and generic retry
  state. It is not evidence of provider-session or already-issued JWT revocation.

## Dev/Test configuration update — 2026-09-09

The [Dev/Test Auth0 evidence](evidence/2026-09-09-dev-test-auth0.json) supersedes
the empty Dev callback lists in the historical observation below. The existing
Dev SPA is reused. A separate Test SPA and RS256 API audience are now saved,
with exact callback/logout/web origins and a Test-only user-delegated grant.
The deployment inventory contains the public runtime identifiers. Test uses
the managed password connection; Dev retains its existing password/Google options.
The two clients share a development tenant and identity connection. Samra still
owns separate environment admission and account data. Actual login, logout,
recovery delivery and deployed audience rejection remain unverified.

## Auth0-first read-back — 2026-09-07

The next private web slice corrects the existing staging API deployment to select
`SAMRA_RELEASE_PROFILE=alpha-release-1`, disable the worker and explicitly keep
both identity and wallet providers fake. This uses the admission controls and
route allowlist already implemented; it introduces no workflow or cloud identity.
Tests load the real deployment assignments through the API configuration parser
so the deployed profile cannot silently fall back to unrestricted demo behavior.
This is an undeployed code correction, not activation evidence.

The GitHub configuration refresh for main `e79285a1f55a81483043c09ca163fdbb9824ace7`
found no required Auth0/API/database-version variables in the repository or the
`staging-zero-traffic-deployment` environment. The staging publication, migration,
deployment, verification and traffic workflows remain manually disabled. These
are separate deployment prerequisites; a successful local web test cannot resolve
them. The earlier cloud inventory and provider read-back below remain dated.

The original Auth0 read-back below used main
`ece64330ec8d28c60eee006b5eee8af0a5ca1509` (#189).
It was a read-only dashboard inspection; no provider settings changed, users
created, emails sent, secret revealed or customer runtime activated.
Persona production activation is paused at David's request pending his
incorporation document. Approved KYC remains required for production wallets.

| Setting                                                                  | Observed development configuration                                                                                                    |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant / issuer                                                          | Development; `https://dev-40h1kaj5488jqctu.us.auth0.com/`                                                                             |
| Web application                                                          | Samra One - Web - Development; Single Page Application; public client ID `1V3fZKx2xbKL5bsaymUPYVHP9VgWzFa0`                           |
| Application login URI, callbacks, logout URLs, web origins, CORS origins | Empty                                                                                                                                 |
| API identifier / signing                                                 | `https://api.samrapay.com/development`; RS256                                                                                         |
| Web API access                                                           | Per-app authorization; a user-delegated grant exists, with zero defined API permissions. Samra still authorizes every account request |
| API token lifetime / offline access                                      | 86,400 seconds; offline access disabled. Browser code requests no refresh token                                                       |
| Web connections                                                          | Username-Password-Authentication and google-oauth2 enabled                                                                            |
| Database connection                                                      | Disable Sign Ups is off; improved brute-force protection is on. Auth0 registration alone grants no Samra admission                    |
| Recovery delivery                                                        | Use my own email provider is off; no configured custom delivery provider or inbox acceptance proof                                    |
| Tenant MFA                                                               | Never; all listed factors disabled. Action-based enforcement and verified-email policy remain unverified                              |

Sources: [web application](https://manage.auth0.com/dashboard/us/dev-40h1kaj5488jqctu/applications/1V3fZKx2xbKL5bsaymUPYVHP9VgWzFa0/settings),
[API](https://manage.auth0.com/dashboard/us/dev-40h1kaj5488jqctu/apis/6a9b52e5261b4bde124b13fb/settings),
[email provider](https://manage.auth0.com/dashboard/us/dev-40h1kaj5488jqctu/templates/provider)
and [MFA](https://manage.auth0.com/dashboard/us/dev-40h1kaj5488jqctu/security/mfa).
These are configuration observations, not evidence of a successful login.
The audience is an identifier and does not prove an API is deployed at that URL.
The staging Cloud Run inventory could not be refreshed during that inspection because
Google required interactive reauthentication. No current deployment/URL claim
is inferred from the older cloud records.

### Remaining setup and acceptance

1. Select the reviewed customer runtime and exact base URL, API revision and
   isolated database. Register only that customer's exact callback/logout URI
   and web origin in the development SPA for non-production acceptance.
   Configure its public domain/client ID/audience and the API's matching issuer
   and audience. A SPA needs no client secret. Do not reuse the development
   tenant as production by relabelling an environment.
2. Use the existing managed invitation flow and Samra's restricted operator
   path to bind eligibility to the exact issuer/subject; keep admission at
   zero until the designated test is ready, then one. Public Auth0 signup and
   switching between password and Google do not grant admission. Never link
   accounts by matching emails or expose an invitation-management HTTP route.
3. Connect reviewed email delivery and verify signup/email-verification policy,
   password reset inbox receipt, expired/used link rejection and the post-reset
   return route. The customer enters their own password with Auth0; retain no
   link, credentials or message content in evidence. Confirm the same subject
   resolves to the same Samra account after reset and restart.
4. Prove login, callback cancellation, logout and later login with the actual
   tenant and exact build. In a second isolated browser context, prove missing,
   wrong-audience, expired and other-account credentials cannot read account
   data. Deny uninvited/revoked identities. Simulate Auth0/API failure without
   a mock fallback, and verify no prior account is shown after logout failure.
5. Before production, record the dedicated production inventory, MFA and
   verified-email enforcement, API-token lifetime/revocation policy, and
   delivered/acknowledged support alerts with David Haile. The development
   default 24-hour token lifetime is not an accepted production decision.
   No 5 → 25 → 100 rollout until the complete KYC/wallet milestone is proven.

Automated checks cover the actual login/signup/recovery UI-to-SDK handoff,
callback cleanup, logout cache removal, late token rejection, stale
initialization, late mutation cache isolation and generic provider failures.
They use synthetic fixtures and
do not establish delivery, real token issuance or live customer acceptance.
Use the existing CI and readiness validator; keep production readiness blocked.

## Activation inventory

Before enabling the handoff, record the exact reviewed public/customer build
SHAs, customer base URL, API deployment, tenant, public SPA client ID, API
audience, and tester scope. Keep the public origin scanner in
`scripts/check-public-build.mjs` intact: the selected customer origin needs an
explicit reviewed inventory addition before a connected public build can pass.
There is intentionally no general origin allowlist bypass in this change.

Configure the customer application using the existing runtime contract in
[Customer identity and Auth0 foundation](../architecture/customer-identity-auth0.md).
The SPA Allowed Callback URL and Allowed Logout URL must equal the customer
application URI, including base path and trailing slash; Allowed Web Origins
contains the origin only. The API audience must match the server validator.
Do not set a client secret in either browser build.

For a controlled test, demonstrate signup, existing-user login, resumed
onboarding, provider cancellation, session restore, logout, denied access,
wrong/expired-token rejection, and an API outage. Review email verification,
MFA, account recovery, and support policy before real users. Use disposable
synthetic identities under the existing non-production boundary.

## Rollback

Remove the public handoff configuration and rebuild/redeploy the reviewed
public artifact through the existing release process. Revert the customer
build using the recorded prior revision. Never restore access by bypassing
Auth0 or Samra authorization checks.

References: [Auth0 Universal Login experience](https://auth0.com/docs/authenticate/login/auth0-universal-login/universal-login-vs-classic-login/universal-experience),
[managed password change](https://auth0.com/docs/authenticate/database-connections/password-change)
and [reauthentication parameter limits](https://auth0.com/docs/authenticate/login/max-age-reauthentication).
