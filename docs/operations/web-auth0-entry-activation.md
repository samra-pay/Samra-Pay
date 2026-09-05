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
- `/session` reads the current customer from Samra. A successful server
  response permits dashboard navigation; the documented unbound-identity or
  onboarding-required responses lead to onboarding. Restricted customers,
  authentication errors, and network failures show a retry/logout state.
  There is no automatic customer creation or financial activation on login.
- In the default mock customer build, login opens the synthetic dashboard and
  signup opens synthetic onboarding, with an explicit demo disclosure.
- Public analytics excludes `/login` and `/signup`. OAuth callback parameters
  are removed by the SDK bridge; callback failure returns to `/login`.

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

Reference: [Auth0 Universal Login experience](https://auth0.com/docs/authenticate/login/auth0-universal-login/universal-login-vs-classic-login/universal-experience).
