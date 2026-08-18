# Samra Pay mobile runtime

The Expo application has one portable API boundary. It does not infer its API
from Replit, the Metro host, a browser location, or a device address.

## Public build configuration

| Variable                       | Required         | Meaning                                 |
| ------------------------------ | ---------------- | --------------------------------------- |
| `EXPO_PUBLIC_SAMRA_DATA_MODE`  | No               | `mock` (default) or `api`               |
| `EXPO_PUBLIC_SAMRA_API_ORIGIN` | Only in API mode | Exact public API origin, normally HTTPS |

Example controlled staging bundle:

```sh
EXPO_PUBLIC_SAMRA_DATA_MODE=api \
EXPO_PUBLIC_SAMRA_API_ORIGIN=https://samra-api.example.run.app \
pnpm --filter @workspace/samra-pay-mobile run build
```

Expo embeds `EXPO_PUBLIC_*` values in the client bundle. The API origin is not a
secret and must never contain credentials, tokens, paths, queries, or fragments.
Remote HTTP origins are rejected; HTTP loopback is allowed only for local
development.

Changing either value requires a new bundle or a restarted Expo development
server. Mock mode clears the API base URL. API mode without a valid origin fails
at startup and never falls back to local financial fixtures.

This configuration makes iOS, Android, Expo web, Replit preview, and a future
Google Cloud staging API use the same generated client boundary. The remittance
screen is the first acceptance-tested mobile cutover: API mode uses server
accounts, beneficiaries, quotes, idempotent transfer commands, backend status
polling, cancellation, and restart recovery. Mock mode still renders the
original remittance demo.

The mobile Home screen is also cut over in API mode. It renders the backend
customer, ledger-derived book and available balances, and ledger activity. A
transfer status change invalidates those financial queries so completion,
failure, cancellation, and refund effects do not remain stale. Cards and
rewards show an explicit unavailable state in API mode until their own backend
sources exist. None of these API-mode screens fall back to mobile fixtures when
the API is unavailable.
