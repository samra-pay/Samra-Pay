# Workforce access boundary

Status: this is the governing current synthetic Operations Portal access
contract and supersedes all demo-operator header instructions. It is not a
production workforce identity system.

The Samra Pay Operations Portal is read-only and denies access unless PostgreSQL resolves a valid workforce session. The former `X-Demo-Operator-*` headers are not accepted.

## Roles

| Role                  | Summary | Customers |               Transfers | Reconciliation | Audit |
| --------------------- | ------: | --------: | ----------------------: | -------------: | ----: |
| `support_readonly`    |     Yes |       Yes |                     Yes |             No |    No |
| `operations_analyst`  |     Yes |       Yes |                     Yes |            Yes |    No |
| `compliance_readonly` |     Yes |        No | Yes, recipient redacted |            Yes |   Yes |
| `administrator`       |     Yes |       Yes |                     Yes |            Yes |   Yes |

No role can mutate transfers, balances, ledger entries, refunds, reversals, reconciliation state, or provider workflows.

## Session controls

- Passwords are stored as salted scrypt hashes.
- Successful login creates a 256-bit opaque token; only its SHA-256 hash is stored.
- The browser receives the token only in an `HttpOnly`, `SameSite=Strict` cookie.
- Sessions expire after eight hours and can be revoked by signing out.
- Disabled users, expired sessions, revoked sessions, invalid credentials, spoofed legacy headers, and unauthorized roles fail closed.
- Five consecutive invalid passwords lock the identity for fifteen minutes.
- Successful login, failed login, logout, and every sensitive read append an audit event.

## Provisioning

Run migrations first. Supply credentials through environment variables so passwords do not enter shell history or Git:

```sh
SAMRA_WORKFORCE_EXTERNAL_REF=employee_001 \
SAMRA_WORKFORCE_LOGIN_NAME=employee@example.com \
SAMRA_WORKFORCE_DISPLAY_NAME="Employee Name" \
SAMRA_WORKFORCE_ROLE=support_readonly \
SAMRA_WORKFORCE_PASSWORD='use-a-secret-manager-value' \
pnpm --filter @workspace/db run workforce:provision
```

Set `SAMRA_WORKFORCE_STATE=disabled` with the same external reference to disable an identity and replace its password. A production identity provider, MFA, workforce lifecycle automation, and centralized secret management remain required before production use.
