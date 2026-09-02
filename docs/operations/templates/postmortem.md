# Incident postmortem

## Control data

- Incident ID and link:
- Title:
- Severity:
- Incident start, declaration, containment, recovery, and end (UTC):
- Authors:
- Reviewers:
- Status: DRAFT | REVIEWED | CLOSED

## Executive account

State what failed, customer and financial impact, duration, how it was
contained, and why recovery was safe. Separate verified fact from inference.

## Impact

- Customers and journeys affected:
- Failed, delayed, duplicated, or uncertain commands:
- Financial exposure by currency:
- Data, credential, security, provider, and compliance exposure:
- Internal operating impact:

Use `unknown` for unproved values and name the owner resolving each unknown.

## Timeline

| UTC time | Event or decision | Actor | Evidence |
| -------- | ----------------- | ----- | -------- |
|          |                   |       |          |

## Detection and response

- First detectable signal:
- Actual detection source:
- Why detection was timely or late:
- Why severity and scope were correct or changed:
- What containment prevented:
- Where authority, access, evidence, or staffing slowed response:

Do not claim alert or SLO performance if the source or target was not approved.

## Causal analysis

- Direct technical cause:
- Control failure that allowed it:
- Organizational or process conditions:
- Why tests, review, staging, monitoring, reconciliation, or recovery controls
  did not prevent or detect it earlier:
- Evidence that could disprove this account:

Avoid “human error” as a root cause. Identify the system that made the error
possible, undetected, or hard to reverse.

## Recovery and financial verification

- Recovery option selected and alternatives rejected:
- Approval and rollback:
- Exact revision, artifact, migration, and database identity:
- Ledger, idempotency, inbox/outbox, audit, and reconciliation proof:
- Independent verification:
- Residual exposure:

## Corrective actions

| Action | Prevent, detect, contain, or recover | Owner | Due date | Acceptance evidence | Status |
| ------ | ------------------------------------ | ----- | -------- | ------------------- | ------ |
|        |                                      |       |          |                     |        |

Each action needs an owner, date, and objective acceptance evidence. “Monitor”
and “be careful” are not corrective actions.

## Decisions and follow-up

- Customer or partner communication:
- Legal, regulatory, insurance, or disclosure decision:
- Runbook or severity change:
- Service-level or alert proposal requiring separate approval:
- Date effectiveness will be reviewed:
