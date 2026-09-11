# Mobile Auth0 native activation

Status, September 10: the approved **Dev/Test Native client configuration is
saved and read-back verified**. See the [dated public evidence](evidence/2026-09-10-native-dev-test-auth0.json)
and [exact build configuration](../../artifacts/samra-pay-mobile/README.md).
No installed native login or user acceptance has passed. The matching iOS 26.5
platform and the base Java/Android tools are now installed. iOS compilation is
bounded by available disk space; Android still needs NDK, CMake and emulator
packages. The organization migration and handoff are complete. Dev/Test remain
paused pending the reviewed application rollout and participant setup. Track
current build and participant results in [session #216](https://github.com/samra-pay/Samra-Pay/issues/216).

The staging procedure below remains preparation only. The default code boundary
is disabled. This runbook does not grant authorization beyond the explicitly
approved Dev/Test configuration or authorize production activation.

Dev reuses `NbcuUH99abGjdE7gkKBY9wjfniE8e4r9`; its old staging callbacks have
been replaced with `com.samrapay.mobile.dev` / `samrapaydevauth`. Test uses the
separate Native client `dFM0ZxzcQoQ6Ppj7KrgOxx70M9KSkk5K`, application ID
`com.samrapay.mobile.test`, and scheme `samrapaytestauth`. Each has only its
matching Samra API user grant. Test is password-only; Dev preserves password
and Google. Both allow only Authorization Code, with no refresh-token or
machine access grant. The native SDK still supplies PKCE and requests `openid`
only. A completed token exchange remains part of installed-device acceptance;
the dashboard did not separately expose token-endpoint authentication method.

## Locked boundary

| Control               | Staging value                                             |
| --------------------- | --------------------------------------------------------- |
| Auth mode             | `auth0-native`                                            |
| SDK                   | `react-native-auth0@5.7.0`                                |
| iOS bundle identifier | `com.samrapay.mobile.staging`                             |
| Android package       | `com.samrapay.mobile.staging`                             |
| Custom scheme         | `samrapayauth`                                            |
| Token request         | `openid`; no `offline_access`                             |
| Token storage         | Auth0 SDK credentials manager                             |
| API credential        | request-time Bearer access token                          |
| DPoP                  | off until the generated API client supports proof headers |
| Default preview       | mock mode, Auth0 disabled, Expo Go preserved              |

The native adapter fails closed on Expo web. Customer web uses the separate
Auth0 SPA boundary and client; no native client or credential storage path is
shared with the browser runtime.

Auth0 authenticates the external subject. The Samra API validates the access
token, resolves the durable identity binding, and owns customer authorization,
onboarding, KYC state, wallet state, financial capability, ledger, and audit
truth. Mobile never accepts a customer ID, KYC state, wallet state, or balance
as authority.

Each mobile account session receives a separate customer query cache. Logout
and failed current credentials clear cached queries and mutations and reset
mounted screen state, including recipient and transfer drafts. Late results
remain isolated in the old cache. A token lookup from an ended session cannot
authorize a request or sign out a newer account. These local boundaries do not
replace the server's identity binding and account authorization checks.

## Required inventory

Record and approve all of the following before building:

1. the staging Auth0 tenant or custom-domain owner;
2. one dedicated Auth0 Native Application and its public client ID;
3. the exact HTTPS Samra API audience shared with the API validator;
4. both exact callback and logout URLs:

   ```text
   samrapayauth://<domain>/ios/com.samrapay.mobile.staging/callback
   samrapayauth://<domain>/android/com.samrapay.mobile.staging/callback
   ```

5. allowed authentication methods, email-verification rule, MFA rule, account
   recovery, deletion, incident response, support owner, and tester roster;
6. the custom Expo development-build or EAS distribution owner, signing owner,
   device inventory, expiration date, and rollback owner.

No client secret belongs in the mobile application, GitHub, EAS public
configuration, Firebase, screenshots, or support records.

## Build gate

Create the staging build with exactly these public values:

```text
EXPO_PUBLIC_SAMRA_DATA_MODE=api
EXPO_PUBLIC_SAMRA_API_ORIGIN=https://<exact-Samra-API-origin>
EXPO_PUBLIC_SAMRA_AUTH_MODE=auth0-native
EXPO_PUBLIC_AUTH0_DOMAIN=<hostname-only>
EXPO_PUBLIC_AUTH0_CLIENT_ID=<public-native-client-id>
EXPO_PUBLIC_AUTH0_AUDIENCE=<exact-HTTPS-Samra-API-identifier>
```

The build must fail on a partial set, HTTP remote API origin, domain with a
scheme/path/port, unsafe audience, wrong application ID, wrong scheme, or any
secret-like input. Build artifacts must be immutable and traceable to one full
Git commit. Do not overwrite the Expo Go-compatible mock preview.

## Zero-traffic test gate

Use approved tester identities with synthetic Samra data only. Capture no raw
token or Auth0 subject in screenshots, logs, GitHub evidence, or audit metadata.
Use the [user-testing procedure](../testing/user-testing.md) and existing
two-user session #216 for Dev/Test. Prove:

1. Universal Login succeeds on one iOS and one Android target;
2. cancel, provider error, network loss, and invalid callback return a safe
   retry state without creating a Samra customer;
3. the access token has the exact API audience and the API rejects ID tokens,
   wrong audience, wrong issuer, expiration, and malformed credentials;
4. first onboarding creates one pending Samra customer and one identity binding;
5. concurrent/replayed onboarding creates no duplicate customer or binding;
6. app restart restores only valid secure credentials and never uses
   `AsyncStorage` for tokens;
7. logout clears the provider session and local secure credentials; a failed
   browser logout still clears local credentials;
8. revoked identity, suspended customer, and closed customer fail closed;
9. API unavailability shows an explicit failure and never falls back to mock
   financial data;
10. logs, analytics, audit, support evidence, crash output, and device backups
    contain no token, password, client secret, or provider profile payload.

## Promotion and rollback

Promotion requires green exact-commit Linux CI, the mobile test matrix above,
an independent configuration audit, and explicit approval. Rollback removes
the connected build from the tester channel, disables the Auth0 Native
Application if compromise is suspected, revokes affected Samra bindings through
the reviewed identity-operations process, and keeps the mock preview available.
Rollback must never re-enable unauthenticated API access or manufacture local
financial truth.

## Hard stops

- shared SPA and native client;
- wildcard callback/logout URLs or production identifiers reused in staging;
- client secret, management token, refresh token, Persona key, or Crossmint key
  in the bundle;
- Expo Go used as evidence for the native Auth0 path;
- no tested account recovery, deletion, incident, and customer-notification policy;
- any real customer or PII in the staging evidence;
- any provider token or status directly granting financial capability;
- any public traffic before the Google staging release and rollback gates pass.
