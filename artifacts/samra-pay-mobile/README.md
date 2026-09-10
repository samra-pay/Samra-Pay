# Samra Pay mobile runtime

The Expo application has one portable API boundary. It does not infer its API
from the Metro host, a browser location, or a device address.

## Local development prerequisites

Use Cursor with the repository's Node 24 and pnpm 11.19.0. Run
`pnpm --filter @workspace/samra-pay-mobile run check:expo` before a native build.
The check uses the installed SDK's compatibility metadata offline; it does not
upgrade packages or suppress compatibility failures. CI runs the same check.

The supported set remains Expo 54 / React Native 0.81 / React 19.1. Expo Clipboard
8 belongs to this SDK; independently upgrading it to 57 does not upgrade the
rest of the native application. React type packages are deduplicated at 19.1
to match the actual React runtime and Expo expectation across the workspace.
Review the existing Expo-major dependency PRs as one compatible upgrade, with
installed iOS/Android acceptance, rather than merging modules independently.

September 10 Mac inspection found Cursor, Node 24, Xcode 26.5 and an iOS 26.0
simulator runtime. CocoaPods 1.17.0 installed all native dependencies successfully.
Xcode rejected the simulator destination because its required iOS 26.5 platform
is not installed; native compilation and simulator launch remain blocked on
Xcode Settings → Components. Android Studio, its SDK/emulator and Java were not
found. Docker subsequently ran the separate local PostgreSQL/API stack and
synthetic ledger checks; that result does not establish native compilation.
These observations are dated prerequisites, not native user acceptance.

Use separate Dev/Test native identifiers and Auth0 Native Application clients.
Saved shared-web SPA clients are not substitutes. On September 10, the approved
Dev client correction and separate Test Native client were saved and read back
in Auth0. See the [public provider evidence](../../docs/operations/evidence/2026-09-10-native-dev-test-auth0.json).
Installed login, logout, recovery and two-account acceptance remain unverified.
The client uses the approved customer-web proxy origin; never embed Google
service-account credentials or grant mobile users invocation of the private API.
Tester passwords, recovery and consent remain under each tester's control.

### Native environment selection

| Environment         | Application ID (iOS and Android) | Auth0 callback scheme |
| ------------------- | -------------------------------- | --------------------- |
| `dev`               | `com.samrapay.mobile.dev`        | `samrapaydevauth`     |
| `test`              | `com.samrapay.mobile.test`       | `samrapaytestauth`    |
| `staging` (default) | `com.samrapay.mobile.staging`    | `samrapayauth`        |

The saved Dev/Test tenant is `dev-40h1kaj5488jqctu.us.auth0.com`:

| Environment | Public Native client ID | Samra API audience | Login connections |
| --- | --- | --- | --- |
| `dev` | `NbcuUH99abGjdE7gkKBY9wjfniE8e4r9` | `https://api.samrapay.com/development` | Password and Google |
| `test` | `dFM0ZxzcQoQ6Ppj7KrgOxx70M9KSkk5K` | `https://api.samrapay.com/test` | Password only |

Each client has a user-delegated grant only for its matching Samra API, no
machine grant, and Authorization Code as its only enabled grant type. The
shared development identity store does not provide Samra account admission or
cross-environment customer access. Server authorization and isolated databases
remain required. No staging client was created by this change; the reused Dev
client no longer accepts the old staging callback URLs.

`native-environments.json` is shared by Expo build configuration and the runtime
adapter so their callback schemes cannot diverge. `app.config.js` is the Expo 54
discovery entry point for the existing CommonJS implementation. A `.cjs` file
alone is not discovered by that SDK. Unknown targets, including production, fail
closed. With no explicit target and disabled auth, the existing mock preview is
unchanged. Dev/Test apps can be installed alongside staging.

Build a local Dev mock preview after installing the matching Xcode platform:

```sh
EXPO_PUBLIC_SAMRA_ENVIRONMENT=dev EXPO_PUBLIC_SAMRA_DATA_MODE=mock \
EXPO_PUBLIC_SAMRA_AUTH_MODE=disabled \
pnpm --filter @workspace/samra-pay-mobile run ios
```

Use `run android` after Android tooling is installed. For real sign-in, provide
the complete public configuration below, select `dev` or `test`, and rebuild the
native app. Expo Go does not support `react-native-auth0`. Register callback and
logout URLs for the selected scheme, domain and application ID:

```text
<scheme>://<domain>/ios/<application-id>/callback
<scheme>://<domain>/android/<application-id>/callback
```

Mock preview success is separate from authenticated shared Test acceptance.
Never promote a bundle compiled for Dev into Test or staging without rebuilding
and recording its public configuration and exact source revision.

## Public build configuration

| Variable                        | Required               | Meaning                                   |
| ------------------------------- | ---------------------- | ----------------------------------------- |
| `EXPO_PUBLIC_SAMRA_ENVIRONMENT` | No                     | `dev`, `test`, or `staging` (default)     |
| `EXPO_PUBLIC_SAMRA_DATA_MODE`   | No                     | `mock` (default) or `api`                 |
| `EXPO_PUBLIC_SAMRA_API_ORIGIN`  | In API mode            | Exact public API origin, normally HTTPS   |
| `EXPO_PUBLIC_SAMRA_AUTH_MODE`   | In API mode            | `disabled` (default) or `auth0-native`    |
| `EXPO_PUBLIC_AUTH0_DOMAIN`      | In `auth0-native` mode | Auth0 tenant/custom-domain hostname only  |
| `EXPO_PUBLIC_AUTH0_CLIENT_ID`   | In `auth0-native` mode | Public Auth0 Native Application client ID |
| `EXPO_PUBLIC_AUTH0_AUDIENCE`    | In `auth0-native` mode | Exact HTTPS Samra API identifier          |

Example controlled staging bundle:

```sh
EXPO_PUBLIC_SAMRA_DATA_MODE=api \
EXPO_PUBLIC_SAMRA_API_ORIGIN=https://samra-customer-web.example.run.app \
EXPO_PUBLIC_SAMRA_AUTH_MODE=auth0-native \
EXPO_PUBLIC_AUTH0_DOMAIN=samra-staging.us.auth0.com \
EXPO_PUBLIC_AUTH0_CLIENT_ID=<public-native-client-id> \
EXPO_PUBLIC_AUTH0_AUDIENCE=https://api.staging.samrapay.com \
pnpm --filter @workspace/samra-pay-mobile run build
```

For an installed Test client, use the verified public configuration below after
the Xcode platform is available and the Test runtime owner opens a bounded
session. The shared runtimes remain paused during the separate cloud migration.
This command builds and launches locally; it does not activate a cloud session:

```sh
EXPO_PUBLIC_SAMRA_ENVIRONMENT=test \
EXPO_PUBLIC_SAMRA_DATA_MODE=api \
EXPO_PUBLIC_SAMRA_API_ORIGIN=https://samra-customer-web-test-378050809796.us-east4.run.app \
EXPO_PUBLIC_SAMRA_AUTH_MODE=auth0-native \
EXPO_PUBLIC_AUTH0_DOMAIN=dev-40h1kaj5488jqctu.us.auth0.com \
EXPO_PUBLIC_AUTH0_CLIENT_ID=dFM0ZxzcQoQ6Ppj7KrgOxx70M9KSkk5K \
EXPO_PUBLIC_AUTH0_AUDIENCE=https://api.samrapay.com/test \
pnpm --filter @workspace/samra-pay-mobile run ios
```

For Dev, substitute the Dev target, client and audience from the table and
`https://samra-customer-web-dev-829811168658.us-east4.run.app` as the API origin.
Use `run android` only after installing Android tooling. Record the actual
installed build SHA and configuration in the existing user-test session #216.

Expo embeds `EXPO_PUBLIC_*` values in the client bundle. None of these values is
a secret. Never put a client secret, server API key, access token, refresh token,
Persona credential, Crossmint credential, or database value in an Expo public
variable. The API origin must never contain credentials, paths, queries, or
fragments. Remote HTTP origins are rejected; HTTP loopback is allowed only for
local development.

Changing either value requires a new bundle or a restarted Expo development
server. Mock mode clears the API base URL. API mode without a valid origin fails
at startup and never falls back to local financial fixtures.

The default `mock` plus `disabled` configuration does not load the native Auth0
module, add the Auth0 config plugin, or set native application identifiers. It
therefore preserves the current Expo Go and browser visual-preview surface. API
mode is intentionally coupled to `auth0-native`; partial or mixed configuration
fails before the application starts and never creates an unauthenticated API
session.

`auth0-native` requires a custom Expo development client, EAS build, or native
build. It is not compatible with Expo Go. The reviewed staging identifiers are:

```text
iOS bundle identifier: com.samrapay.mobile.staging
Android package:       com.samrapay.mobile.staging
custom URL scheme:     samrapayauth
```

Register these exact Auth0 Native Application callback and logout URLs, replacing
`<domain>` with the hostname-only Auth0 domain:

```text
samrapayauth://<domain>/ios/com.samrapay.mobile.staging/callback
samrapayauth://<domain>/android/com.samrapay.mobile.staging/callback
```

The native adapter uses Auth0 Universal Login, Authorization Code with PKCE, and
the SDK credentials manager. Tokens remain in iOS Keychain or Android encrypted
storage rather than `AsyncStorage` or React state. It requests only `openid`,
does not request `offline_access`, and resolves a fresh Bearer token for each API
request. DPoP is explicitly disabled until the generated API client can produce
the required per-request proof header; the API still validates RS256 issuer and
audience exactly.

This configuration keeps iOS, Android, Expo web, local previews, and a
future Google Cloud staging API on the same generated client boundary. Native
Auth0 API mode runs only in iOS and Android custom builds; Expo web remains on
the disabled-auth mock preview because customer web has its own SPA boundary. The
remittance screen is the first acceptance-tested mobile cutover: API mode uses server
accounts, beneficiaries, quotes, idempotent transfer commands, backend status
polling, cancellation, and restart recovery. Mock mode still renders the
original remittance demo.

Restart recovery is backend-authoritative. The app stores the server quote,
the transfer id when known, and idempotency keys needed to safely resume an
interrupted command. If the app closes after the submission key is durable but
before the transfer response is saved, the next launch automatically replays
the same command with the same key and recovers the original backend transfer.
An interrupted user-authorized cancellation is resumed under the same rule
while the backend transfer remains cancellable.
Once a transfer id exists, the app fetches status and financial effects from
the API. Corrupt local recovery data is discarded, and no local balance or
client-generated transfer becomes financial truth.

The mobile Home screen is also cut over in API mode. It renders the backend
customer, ledger-derived book and available balances, and ledger activity. A
transfer status change invalidates those financial queries so completion,
failure, cancellation, and refund effects do not remain stale. Cards and
rewards show an explicit unavailable state in API mode until their own backend
sources exist. None of these API-mode screens fall back to mobile fixtures when
the API is unavailable.

## Native module and permission scope

The application does not use device location or photo-library selection.
`expo-location` and `expo-image-picker` are not dependencies; `app.json` and
the dynamic Expo configuration contain no plugins or usage descriptions for
those capabilities. Adding either capability requires an explicit product need
and review of the resulting native permissions and privacy declarations.
Dependency removal alone does not verify a previously distributed native build;
this change takes effect in a subsequent separately authorized build/release.
