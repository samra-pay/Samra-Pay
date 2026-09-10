# Dev/Test runtime alerts

Owner and recipient: David Haile, david@samrapay.com. Recipient confirmed
September 10, 2026. These are synthetic environment alerts, separate from
production incident readiness and the combined $50 budget alerts.

Both projects use native Cloud Logging and Cloud Monitoring. Each has one email
notification channel and one enabled log-based alert policy. No additional
monitoring vendor, custom metric, public operations endpoint, or provider key
is required.

| Environment | Alert policy ID | Notification channel ID |
| --- | --- | --- |
| Dev | 15534038861523532220 | 13897251972279420892 |
| Test | 15046887376863339978 | 13983279501113670307 |

The policy reads Cloud Run service/job stdout and stderr, matching native
`severity>=ERROR` or Pino's numeric `jsonPayload.level>=50`. The existing API
logger uses Pino levels, so a severity-only filter would miss structured errors.
The exact filter is:

```text
(((resource.type="cloud_run_revision" OR resource.type="cloud_run_job") AND
  (log_id("run.googleapis.com/stdout") OR log_id("run.googleapis.com/stderr"))) OR
 (resource.type="global" AND log_id("samra-dev-test-alert-drill") AND
  jsonPayload.event="samra.synthetic.alert-drill")) AND
(severity>=ERROR OR jsonPayload.level>=50)
```

The `OPENED` notification prompt is explicitly enabled. Notifications are rate-limited to one per five minutes; incidents auto-close
after 30 minutes without a new matching event. No log payload fields are
extracted into notification labels. Request-log 503s from an intentionally
paused web service do not trigger this application-error policy.

This is baseline error detection. It does not prove availability, detect every
HTTP failure or stalled financial workflow, or replace readiness and read-only
drain checks. During facilitated sessions, the operator observes readiness and
scenario results. Do not describe these alerts as production SLO coverage.

## Response and drill

1. Open Monitoring → Alerting in the named project. Inspect the service/job
   status and sanitized logs. Do not copy credentials, user subjects, raw
   provider payloads, or database errors into an issue.
2. Pause affected user testing for account-isolation, ledger, or core-flow
   failures. Record a defect through the existing GitHub test-session procedure.
3. Preserve evidence and use the [session operator](dev-test-runtime.md).
   A failed drain leaves the worker/database available for recovery; never
   force an unresolved transfer to a terminal state just to stop compute.
4. For a notification drill, an authorized operator writes one global log entry
   to `samra-dev-test-alert-drill` with event `samra.synthetic.alert-drill`, level
   `50`, severity `DEFAULT`, and a message explicitly identifying a harmless
   synthetic test. This exercises the Pino-level branch without crashing an app
   or changing data. Record the event time, matching cloud incident, and David's
   separate inbox acknowledgement. A saved policy or log-write response alone
   is not end-to-end delivery proof.

Use the [native log-alert API](https://docs.cloud.google.com/logging/docs/alerting/log-based-alerts)
to inspect/update these existing resources. Do not create duplicate policies
when repeating a drill. Preserve cloud receipts in the operator's persistent
home directory, excluding credential values.

## September 10 verification status

Policies and channels were saved and read back. Harmless global drill logs were
ingested. Final incident readback now confirms both policies opened an incident:

| Environment | Incident | Open time (UTC) |
| --- | --- | --- |
| Dev | `0.ocgxpm7k624x` | 2026-09-10 16:17:38 |
| Test | `0.ocgx8zbc7byk` | 2026-09-10 15:57:24 |

Both incidents match the exact policy and global drill resource. The Test
incident predates the final 16:16 drill; do not infer that the final configuration
change caused it. Earlier empty incident-list responses did not establish an
absence of an incident. **Cloud incident creation is verified; inbox delivery
remains unverified** until David confirms receipt. See the
[dated alert evidence](../../docs/operations/evidence/2026-09-10-dev-test-alerts.json).
