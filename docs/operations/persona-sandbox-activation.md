# Persona sandbox activation runbook

Status: preparation only. This runbook does not authorize a Persona account
change, credential creation, Google Cloud secret change, deployment, real PII,
or production traffic.

## Purpose

Activate the existing Samra-owned identity-case boundary against one reviewed
Persona sandbox without letting Persona become the customer, state, audit, or
capability source of truth.

## Required inventory

Record identifiers and ownership, never secret values, in the activation
evidence:

- Persona account and sandbox environment owner;
- inquiry template ID and immutable reviewed version;
- environment ID;
- webhook endpoint ID and exact staging URL;
- allowed web and mobile origins;
- API key credential owner and rotation date;
- current webhook-secret owner and rotation date;
- approved PII field map, purpose, retention, residency, deletion, support,
  appeal, and manual-review policy.

The target endpoint is:

```text
POST https://<staging-api-host>/api/v1/provider-events/persona
```

## Google Cloud mapping

When separately authorized, create secret versions in Google Secret Manager
and grant access only to the staging API runtime service account:

| Runtime variable                        | Secret Manager object or value                                       |
| --------------------------------------- | -------------------------------------------------------------------- |
| `PERSONA_API_KEY`                       | `samra-staging-persona-api-key`                                      |
| `PERSONA_WEBHOOK_SECRET`                | `samra-staging-persona-webhook-secret`                               |
| `PERSONA_WEBHOOK_SECRET_PREVIOUS`       | `samra-staging-persona-webhook-secret-previous` during rotation only |
| `SAMRA_CUSTOMER_IDENTITY_PROVIDER_MODE` | `persona-sandbox`                                                    |
| `PERSONA_INQUIRY_TEMPLATE_ID`           | approved non-secret template ID                                      |
| `PERSONA_ENVIRONMENT_ID`                | approved non-secret environment ID                                   |

Do not add secrets to GitHub, Firebase, web/mobile bundles, build arguments,
container layers, logs, test reports, Qase, screenshots, or support tickets.

## Activation sequence

1. Verify the exact Git SHA, clean source, staging project, region, runtime
   service account, database migration state, and disabled current mode.
2. Confirm the approved Persona sandbox inventory and PII policy.
3. Create secret metadata and versions under a separate cloud-change approval.
4. Grant only secret-version access to the staging API service account.
5. Configure the exact non-secret variables and secret references on a new
   Cloud Run revision with zero public traffic.
6. Run inquiry creation using a synthetic customer and confirm that the request
   contains only the template ID and opaque Samra case reference.
7. Send signed approved, declined, review, unsupported, duplicate, stale,
   out-of-order, malformed, oversized, and rotated-secret webhook fixtures.
8. Verify PostgreSQL state, event disposition, audit digest, replay behavior,
   no raw payload retention, and continued financial capability blocking.
9. Route staging traffic only after readiness, rollback, logs, alerts, and
   independent post-audit pass.

## Rollback

Set `SAMRA_CUSTOMER_IDENTITY_PROVIDER_MODE=fake` on a new staging revision,
route traffic back, revoke the active Persona API key and webhook secret if
compromise is suspected, and preserve normalized Samra event evidence. Never
delete or rewrite identity transitions to make rollback appear clean.

## Exit criteria

- all synthetic sandbox tests pass twice across restart;
- current and previous secret rotation is proven, then the previous secret is
  removed;
- one provider event cannot update another inquiry or customer;
- unsupported and out-of-order events cannot advance capability;
- no raw Persona payload or customer PII appears in application, audit,
  analytics, logs, build, CI, or Qase evidence;
- web and mobile remain blocked until the signed webhook changes the Samra case;
- an independent operator confirms the Google Cloud and Persona configuration.
