# Verified marketing leads

Status: foundation extended by the [marketing activation build](marketing-activation-build.md), including form wiring, signed webhooks, preference capabilities, Resend contact sync and advertising adapters. Not migrated to cloud or activated. The remaining paragraphs describe the original foundation scope; the activation-build document governs current integration status.

## Implemented boundary

`PostgresMarketingLeadStore` persists registration receipts, pending email challenges, verified contact state, versioned permission history and audience-removal requests. `createVerifiedLeadHandler` exposes prepared same-origin registration and explicit confirmation routes. `sendNextLeadVerification` uses an injected bounded Resend transport.

Registration returns a generic acceptance receipt. Only possession of the single-use email token plus an explicit confirmation POST activates email updates. GET requests do not confirm, so ordinary email-link previews do not subscribe people. Tokens expire after 24 hours, stay in URL fragments and are removed from browser history; the confirmation page has no analytics. Do not enable email click/open tracking for these messages.

Advertising requires both the original optional choice and an unchecked-by-default confirmation-page choice. Email updates do not require advertising permission. `withdrawAdvertising` preserves email updates; full withdrawal, bounce or complaint suppresses both and prevents anonymous reactivation. Withdrawal methods are internal: a contact UUID is not authorization. An authenticated preferences endpoint and signature-verified provider webhooks must be implemented before activation.

Attribution permits only the known social source/medium/campaign/content values. First touch means the first verified registration attribution, not a reconstructed anonymous browsing history. Signup touch updates at subsequent confirmation. Client attribution is self-reported and must not serve as fraud or eligibility evidence. No KYC, balances, ethnicity, immigration status or hardship data belongs in advertising payloads.

## Delivery and persistence

Migration `0019_verified_marketing_leads.sql` is append-only and includes SQL checks and an immutable permission-history trigger. The SQL migration is authoritative for custom constraints; schema definitions alone do not recreate the trigger. Review future generated migrations against these constraints.

Use a separate secret of at least 32 random bytes for each named token-key version. New challenges pin the active version; retain previous keys for outstanding challenges. Missing or changed keys fail closed. Never log keys, tokens, raw emails or request bodies. Worker leases prevent concurrent sends, retries reuse the same provider idempotency key, and dispatch rechecks suppression under the contact lock. Always supply the bounded Resend transport because dispatch holds a transaction during the provider request.

Enforce an edge/request limiter before mounting the handler. The mandatory limiter callback is an integration contract, not an implemented distributed rate limiter. Per-contact controls also enforce a 60-second resend cooldown and five challenges per day. Malformed requests never expose provider errors.

Audience-removal rows are pending work, not evidence of removal from Meta or Google. No audience-add adapter, provider-removal worker, conversion upload or campaign is included. Recheck current permission and removal revision immediately before any future sync; record provider acknowledgement separately. Hashing an email does not anonymize it.

## Activation sequence

1. Review and merge the exact candidate with CI green. Resolve the public-site release source before integrating this work; do not replace the live site from an unrelated checkout.
2. Implement the public registration form with separate notices/choices, authenticated withdrawal and signed bounce/complaint/unsubscribe handling. Verify English and Amharic wording and the published privacy notice match `marketing-2026-09-09`.
3. Wire the isolated service to a least-privilege database role, reviewed migration digest, Secret Manager token keys, edge limiter and bounded Resend transport. Mount the confirmation route on the canonical origin. Set a retention/deletion procedure for personal data and append-only consent records.
4. Prove the full flow with a specifically approved test mailbox: registration, delivery, confirmation, withdrawal, retries and provider suppression. No existing contact is automatically treated as verified or opted into advertising.
5. Verify Meta/Google account eligibility and data-use permissions, then implement and test separate audience synchronization with acknowledgement, retries and removal. Until then, `ads_allowed` is an internal permission flag only.

## Validation

Use an isolated disposable PostgreSQL database: `test:migrate`, then `test:marketing-leads:postgres` in `@workspace/db`. The integration suite truncates its synthetic lead tables. CI runs it before other seeded database checks. HTTP/worker tests use synthetic transports; no real recipient is contacted.
