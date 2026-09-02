# Security policy

## Current production boundary

Samra Pay's public production surface is an informational static site. It must
not collect customer data, authenticate users, call application APIs, initiate
KYC, access a database, activate a financial vendor, or move money.

Authentication, KYC, wallets, payments, remittance, and customer-data services
are separate release boundaries. Their presence in source code or tests is not
evidence that they are active or approved for production use.

## Reporting a vulnerability

Do not open a public issue containing vulnerability details, credentials,
personal data, or exploitation steps. A monitored external vulnerability-reporting
channel is not currently configured. Enabling GitHub private vulnerability
reporting or publishing a monitored security address is a release blocker before
external users are invited to report security issues.

Internal reporters must use the existing confidential operator channel and
include the affected route or component, reproduction conditions, impact, and
the minimum evidence needed to validate the issue. If no confidential channel
is available, stop and establish one before transmitting vulnerability details.

Never include real customer, identity-document, financial, authentication, or
vendor-secret data in a report.

## Release requirements

Production changes must follow this sequence:

1. Reviewed pull request and required tests.
2. Clean build from the exact authorized commit with frozen dependencies.
3. Keyless, least-privilege deployment identity.
4. Content-addressed build manifest and immutable release identifier.
5. Controlled promotion of the reviewed artifact without rebuilding it.
6. Independent post-deployment checks for routes, security headers, and scope.
7. Recorded previous and current release identifiers with a tested rollback.

No release may silently expand public traffic, customer-data collection,
authentication, KYC, vendor access, database access, or money movement.

## Secrets and sensitive data

- Store production secrets in Google Secret Manager, not source control,
  repository variables, application bundles, logs, or screenshots.
- Grant secret access to dedicated runtime identities at the individual-secret
  level and pin applications to explicit secret versions.
- Do not log access tokens, refresh tokens, session cookies, authentication
  headers, KYC evidence, document numbers, bank credentials, or full financial
  payloads.
- Treat Firebase client configuration as public metadata. Protect Firebase
  services with explicit Security Rules, API restrictions, and App Check before
  enabling them.

## Financial-product gates

Before any real customer data or funds are accepted, the release requires a
current threat model, data-retention schedule, incident-response runbook,
backup-restoration exercise, webhook replay exercise, ledger-invariant audit,
vendor and legal approvals, and an independent security assessment.
