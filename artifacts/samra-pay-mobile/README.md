# Samra Pay mobile runtime

The Expo application has one portable API boundary. It does not infer its API
from the Metro host, a browser location, or a device address.

## Public build configuration

| Variable                       | Required               | Meaning                                   |
| ------------------------------ | ---------------------- | ----------------------------------------- |
| `EXPO_PUBLIC_SAMRA_DATA_MODE`  | No                     | `mock` (default) or `api`                 |
| `EXPO_PUBLIC_SAMRA_API_ORIGIN` | In API mode            | Exact public API origin, normally HTTPS   |
| `EXPO_PUBLIC_SAMRA_AUTH_MODE`  | In API mode            | `disabled` (default) or `auth0-native`    |
| `EXPO_PUBLIC_AUTH0_DOMAIN`     | In `auth0-native` mode | Auth0 tenant/custom-domain hostname only  |
| `EXPO_PUBLIC_AUTH0_CLIENT_ID`  | In `auth0-native` mode | Public Auth0 Native Application client ID |
| `EXPO_PUBLIC_AUTH0_AUDIENCE`   | In `auth0-native` mode | Exact HTTPS Samra API identifier          |

Example controlled staging bundle:

```sh
EXPO_PUBLIC_SAMRA_DATA_MODE=api \
EXPO_PUBLIC_SAMRA_API_ORIGIN=https://samra-api.example.run.app \
EXPO_PUBLIC_SAMRA_AUTH_MODE=auth0-native \
EXPO_PUBLIC_AUTH0_DOMAIN=samra-staging.us.auth0.com \
EXPO_PUBLIC_AUTH0_CLIENT_ID=<public-native-client-id> \
EXPO_PUBLIC_AUTH0_AUDIENCE=https://api.staging.samrapay.com \
pnpm --filter @workspace/samra-pay-mobile run build
```

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
