# Runbook: credential compromise

Status: decision procedure only. A suspected compromise is SEV0.

## Contain without destroying evidence

1. Open an access-restricted incident record. Do not paste the credential,
   token, cookie, private key, raw payload, or customer data into it.
2. Identify the exact account, tenant, project, environment, credential type,
   privileges, creation time, last rotation, and systems that consumed it.
3. Preserve audit logs and immutable release identity before changing access.
4. Disable or revoke the affected credential only through the authoritative
   system and an approved owner. Do not delete the account or audit history.
5. Stop affected traffic if continued use could move money, expose customer
   data, bypass authorization, or contaminate evidence.

## Scope

- Determine earliest possible exposure and last confirmed legitimate use.
- Enumerate repositories, build logs, artifacts, runtime configuration, local
  machines, CI variables, vendor consoles, and downstream credentials reachable
  with the compromised authority.
- Search for use, not just storage. A rotated secret does not remove access
  already obtained through sessions, keys, or delegated roles.
- Separate confirmed events from suspected access and impossible paths.

## Recover

Rotation requires an owner, peer review, overlap or cutover plan, validation,
rollback, and proof that the old credential no longer works. Use the narrowest
replacement privileges and record every dependent consumer updated. Provider,
cloud, customer-data, and production changes remain separately authorized.

Before closure, verify old access is denied, new access is least-privileged,
services run the intended revision, no secret appears in retained evidence,
financial and reconciliation sweeps pass, and notification or disclosure
decisions have named owners. Complete a postmortem even when misuse is not
proved.
