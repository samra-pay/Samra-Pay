# Samra Pay product and engineering documentation

This is the canonical capability-status and evidence index. Read
[AGENTS.md](../AGENTS.md), [local setup](../CONTRIBUTING.md), and
[engineering authority and decisions](engineering-governance.md) before implementation.

Status review: **2026-09-05**, owner **David Haile**, source baseline
`5bf1659413a8a3918a3fa3b58829d98c1bd47470`. This review inspected repository
code and live GitHub metadata/checks. Cloud and provider observations below
are dated records from the linked runbooks, **not a fresh cloud/vendor audit**.
Evidence applies only to its recorded scope and SHA; later commits need their
own checks and release evidence.

GitHub-only update on **2026-09-05** at
`33bbad186e1f44e175aa6e7b910bc67918830d14`: the repository transfer to
`samra-pay/Samra-Pay` and main ruleset enforcement are verified. The broader
capability baseline above remains historical. See the
[transfer and release-freeze record](operations/enterprise-transfer-2026-09-05.md).
The source-authority update reconciles contracts, recovery provenance and
Notion tooling with that organization. The September 5 [trust repair](operations/evidence/2026-09-05-cloud-trust-repair.json)
verified the two existing providers. The September 6 [controller record](operations/evidence/2026-09-06-staging-controller-foundations.json)
adds verified promotion/rollback, zero-traffic and image-verifier IAM foundations,
the missing migration environment and a dated backup-freshness observation.
Migration, revision-probe and operational acceptance remain open. The release
freeze remains active pending the remaining cutover and
release evidence.

## Alpha north star

Samra Pay's Alpha is a synthetic-first remittance product with a Samra-owned
customer record, double-entry control ledger, audit history, reconciliation,
and PostgreSQL database. The accepted repository stack remains Auth0, Persona,
Crossmint, Google Cloud, GitHub Actions, and Qase. Funding and Ethiopia payout
providers remain unresolved. Cybrid, Rain, and Bridge are post-Alpha alternatives.

Crossmint, Auth0, and Persona provide bounded capabilities. They do not own the
Samra customer, authorization decision, balance, transaction state, ledger,
audit trail, reconciliation result, or provider-migration mapping.

## Capability register

“Implemented” means source exists; “tested” needs a result for an exact SHA;
“deployed” needs a target/revision read-back; “production-approved” needs an
explicit approval for that scope. None of these states implies another.

| Capability          | Implemented source                                                                                                                     | Deployment / external evidence                                                                                                         | Remaining gate                                                                                                                                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Customer identity   | Auth0 backend, web login/signup and native adapter; disabled by default                                                                | Tenant/native setup and deployed customer handoff not verified by this review                                                          | Exact tenant/client/audience, API, callback and tester inventory; [web activation](operations/web-auth0-entry-activation.md), [native activation](operations/mobile-auth0-native-activation.md)                          |
| KYC                 | Persona fake/sandbox adapter, signed webhook and durable case                                                                          | No deployed KYC decision path established by the cited evidence                                                                        | Approved data/support policy and [sandbox activation](operations/persona-sandbox-activation.md)                                                                                                                          |
| Wallet              | Synthetic wallet plus guarded creation-only customer sandbox adapter and migration 0017                                                | Sept 4 record proves console wallet and authenticated GET, not deployed Samra provisioning                                             | Private API/database, consent, identity, scoped key and signer/recovery evidence; [connection record](operations/crossmint-sandbox-connection.md), [deployment package](operations/staging-wallet-deployment-package.md) |
| Financial core      | Durable PostgreSQL ledger, holds, remittance, audit, idempotency and reconciliation                                                    | Synthetic tests; no real-money runtime evidenced                                                                                       | Funding/payout decisions, operational/security and legal approvals                                                                                                                                                       |
| Cloud foundation    | Guarded infrastructure and delivery contracts                                                                                          | Separate staging and production foundations recorded as applied; staging inspection in the Sept 4 wallet record found no Cloud Run API | Fresh resource, DB/TLS/roles, secret metadata, image and migration inventory before execution                                                                                                                            |
| Public site         | Isolated English/Amharic marketing build                                                                                               | Aug 31 static release recorded as deployed/verified at `32c550321802c4747fa53871fb7b51c7977e9959`                                      | Current public bytes/domain/configuration need fresh release verification; [cloud release record](../deploy/gcp/README.md)                                                                                               |
| Public waitlist     | Controlled Resend Contacts service/Firebase rewrite and disabled-by-default UI; older PostgreSQL waitlist model also remains in source | This review establishes implementation, not collection or inbox delivery                                                               | Separate exact-release authorization, privacy and provider/configuration evidence; [launch contract](../deploy/gcp/coming-soon-static-hosting.json)                                                                      |
| Mobile distribution | Expo application and native auth boundary                                                                                              | Historical Firebase project linkage; app registration/distribution not verified here                                                   | Device/build evidence and native activation                                                                                                                                                                              |
| Quality             | CI/security, PostgreSQL, resilience, performance, container and immutable release gates                                                | Required CI/security and portability passed for the baseline SHA; see evidence below                                                   | Candidate-specific results, governed manual acceptance evidence and separate release approval                                                                                                                            |
| Merge protection    | Required-check contracts and CODEOWNERS                                                                                                | Ruleset `22344977` enforced after the Sept 5 organization transfer; exact checks, PR, queue, no force-push/deletion or bypass          | Keep exact-candidate checks and current settings evidence; source/cloud authority cutover remains pending                                                                                                                |
| Operations          | Portal, workforce controls, cases, incident runbooks and synthetic recovery rehearsal                                                  | Staffed coverage, live monitoring, cloud restore and service targets not established                                                   | [Operational readiness](operations/operational-readiness.md)                                                                                                                                                             |
| Replit              | Temporary preview/rollback support                                                                                                     | Not code, design, financial, database or production truth                                                                              | Retire only after governed replacement evidence                                                                                                                                                                          |

## Evidence and next verification

- **GitHub, checked 2026-09-05:** local and remote `main` matched the baseline.
  [Required CI](https://github.com/haileleuld87/Samra-Pay/actions/runs/33970338777),
  [Required security](https://github.com/haileleuld87/Samra-Pay/actions/runs/33970338768),
  and [container portability](https://github.com/haileleuld87/Samra-Pay/actions/runs/33970338813)
  passed. Those results do not certify later changes or an immutable release
  candidate. See [merge enforcement status](operations/repository-merge-controls.md).
- **Recorded production foundation:** the
  [cloud runbook](../deploy/gcp/README.md) records production project/billing,
  keyless identities, registry, private network and PostgreSQL data foundation.
  Its data post-audit is tied to `7977afc1a550521fefe1ae6df9acb787f75b1ed4`.
  Secret-version absence and an empty database are historical observations;
  re-read metadata/schema before relying on them. An applied foundation does
  not establish customer traffic or financial services.
- **Recorded staging/provider inspection:** the Sept 4
  [Crossmint record](operations/crossmint-sandbox-connection.md) distinguishes
  console wallet/GET, undeployed API, private PostgreSQL, and unresolved TLS.
  The Sept 5 [migration foundation follow-through](operations/staging-migration-foundation.md)
  records an access blocker. Neither record authorizes another provider call.
- **Next backend milestone:** one authenticated, consenting test customer's
  durable wallet creation and replay/restart evidence. Follow the
  [private deployment package](operations/staging-wallet-deployment-package.md)
  and [governed migrations](operations/staging-migrations.md); source availability
  does not satisfy their cloud, identity, cost or activation gates.

## Governing documentation

### Product and platform

- [Engineering authority, decision register, and open gates](engineering-governance.md)
- [Local development and contribution](../CONTRIBUTING.md)

- [Alpha platform and vendor boundary](architecture/alpha-platform.md)
- [Architecture foundation](architecture/README.md)
- [Customer onboarding and consent](architecture/customer-onboarding.md)
- [Customer funnel and attribution](architecture/customer-funnel-attribution.md)
- [Frontend cutover](architecture/frontend-cutover.md)

### Identity and wallet

- [Auth0 customer identity](architecture/customer-identity-auth0.md)
- [Cloud Run service authentication](architecture/cloud-run-service-authentication.md)
- [Persona identity case](architecture/customer-identity-persona.md)
- [Crossmint USDC wallet boundary](architecture/customer-wallet-crossmint.md)
- [Dated Crossmint sandbox evidence](operations/crossmint-sandbox-connection.md)
- [Private wallet deployment package](operations/staging-wallet-deployment-package.md)

### Financial control

- [Backend persistence](backend-persistence.md)
- [Control ledger](architecture/ledger.md)
- [Synthetic remittance lifecycle](architecture/remittance.md)

### Operations

- [Operations control plane](architecture/operations-control-plane.md)
- [Operational readiness boundary](operations/operational-readiness.md)
- [Incident response framework](operations/incident-response.md)
- [Synthetic PostgreSQL recovery rehearsal](operations/postgres-recovery-rehearsal.md)
- [Workforce access](operations/workforce-access.md)
- [Case management](operations/case-management.md)
- [Persona sandbox activation](operations/persona-sandbox-activation.md)
- [Staging vendor runtime readiness](operations/staging-vendor-runtime-readiness.md)
- [Mobile Auth0 native activation](operations/mobile-auth0-native-activation.md)
- [Web account entry activation](operations/web-auth0-entry-activation.md)
- [Governed staging migrations](operations/staging-migrations.md)

### Cloud and delivery

- [Google Cloud foundation and cutover](../deploy/gcp/README.md)
- [Public and product surface boundary](architecture/public-product-surface-boundary.md)
- [Repository merge controls](operations/repository-merge-controls.md)
- [Read-only GitHub merge settings audit](operations/repository-settings-audit.md)
- [Coming-soon Google Cloud launch](operations/coming-soon-cloud-launch.md)
- [Staging CI/CD, traceability, promotion, and rollback](operations/staging-release-control-plane.md)
- [Testing strategy](testing/testing-strategy.md)
- [Qase and CI reporting](testing/qase-ci.md)
- [Release-candidate evidence](testing/release-candidate-evidence.md)
- [Optional Qase reporting decision](architecture/optional-qase-reporting.md)
- [Replit transition boundary](architecture/replit-runbook.md)

### Experience system

- [Design-system source of truth](../artifacts/samra-pay-ds/README.md)
- [Design-system current state](../artifacts/samra-pay-ds/docs/current-state-audit.md)
- [Financial UI truth](../artifacts/samra-pay-ds/docs/financial-ui-truth.md)
- [Accessibility](../artifacts/samra-pay-ds/docs/accessibility.md)

## Reading paths

**Head of Product:** this page, Alpha platform, onboarding, remittance, funnel,
financial UI truth, Operations Portal, testing strategy, and open Alpha gates.

**CTO:** this page, architecture foundation, Alpha platform, persistence,
ledger, identity, wallet, operations access, Google Cloud, testing strategy,
and release evidence.

Detailed PR history and old screenshots are evidence, not governing product
documentation. When a detailed document or observed state conflicts with this page, identify
the dated evidence and correct the contradiction. Pause only the work that
depends on an unresolved decision; continue unaffected authorized work.

## Documentation control

- This page owns the capability register and evidence pointers. Update its review
  date and source baseline when refreshing status; do not silently turn a
  historical observation into a current claim.
- Architecture documents own boundaries and invariants; runbooks own execution
  steps; test documents own evidence contracts.
- A capability is always labeled as proposed, implemented, tested, deployed, or
  production-approved. These states are not interchangeable.
- A vendor or platform decision change must update this page, the Alpha diagram,
  its adapter contract, affected hard stops, and test evidence in one pull
  request.
- Historical evidence remains immutable but must be labeled when it no longer
  describes the current architecture.
