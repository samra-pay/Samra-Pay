# Samra Pay: commercial launch copy and email opt-in

Date: September 3, 2026
Branch: `codex/public-site-commercial-launch`
Base: `f1371a39b48a6c3ed270b8dca09027be57fc650c`
State: local working changes; not committed, pushed, deployed, or collecting email.

## Audit scope and limits

Reviewed the public entrypoint, homepage, card portfolio and its three URL aliases, values, FAQ, founder notes, privacy, terms, fallback page, shared navigation/footer, English/Amharic content, metadata, and social-sharing artwork.

This is a source, content, and component-behavior audit. The Product Design audit skill requires screenshots before visual findings. Browser administrative-policy validation blocked local browser inspection, so the screenshot audit was paused. Unit-test DOM assertions are not evidence of rendered mobile/desktop layout, keyboard ergonomics, or field performance. No alternate browser was used to bypass that restriction.

## Findings and changes

| Area | Finding | Change |
| --- | --- | --- |
| Positioning | Alpha, development, and repeated unavailable-service copy dominated public pages. | Commercial, future-oriented launch copy in both languages; no promised launch date. |
| Homepage | Launch updates had no visible conversion path. | Stay informed email/consent form in the hero; secondary portfolio link; header, mobile menu, footer, and closing CTA link to it. |
| Level 4 | Elite 100 mixed premium founder recognition with Alpha testing. | Separate invitation-only founding edition for 100 founder-selected members. |
| Level 4 artwork | Member since 2026 and 1/100 implied an assigned membership. | Founding member, limited edition 100, no membership year or assigned serial. Removed its network mark; retained existing titanium styling and artwork. |
| Portfolio comparison | Airline tier called itself the highest level; founder benefits could be mistaken for a tier upgrade. | Three everyday tiers plus a distinct founder edition; separate invitation terms and a dedicated FAQ answer. |
| Financial claims | Proposed rates, fees, miles and airline arrangements could be read as committed. | Retained proposed labels, eligibility, partner-agreement and final-term qualifiers. No new economics, issuer, partner, insurance or launch claims. |
| Footer | Unconfigured social channels appeared as pending pseudo-links. | Only configured social destinations render. |
| Privacy and terms | No-form and concept-site descriptions conflicted with the new design. | Describes actual disabled-public/local-test behavior and separate email consent; preserves analytics choices and service-term boundaries. |
| Social sharing | Raster artwork still said Modern banking and used the old Replit address. | Existing layout retained; copy changed to Your next chapter, connected. and www.samrapay.com. |
| Localization | New English portfolio strings could silently fall back to English in Amharic. | Dictionary updated; a syntax-tree regression test covers copy calls, tier fields, benefit lists and comparison cells. |

## Email form: implemented versus pending

Implemented locally:

- Visible email label, email input, unchecked explicit consent, privacy link.
- Invalid-email and missing-consent messages with alert semantics and field associations.
- Local test completion explicitly says that no subscription was created.
- No network request, address persistence, provider key, or analytics event.
- Disabled on every non-loopback hostname, including production and public previews.
- Email consent remains independent of saved analytics permission.

Not implemented or activated:

- A collection endpoint, subscriber database, Resend contact creation, confirmation email, or real success response.
- DNS/domain setup, Resend credentials, sender verification, production CSP or hosting changes.
- Real email collection, confirmation, sending, or unsubscribe handling.

Do not publish this as an operational email subscription flow.

## Resend connection checklist

Required decisions: verified sender address, approved backend/deployment destination, subscriber retention policy, and whether launch updates use a dedicated segment/topic.

Recommended implementation after those decisions:

1. Keep the Resend key in server-side secret storage. Never use a browser environment variable or put the key in this form.
2. Add a reviewed server endpoint with validation, rate limiting, bot/abuse controls, request limits, and privacy-safe logging.
3. Record explicit consent with timestamp, consent-text version, source and language; keep addresses out of analytics, URLs and referrers.
4. Use an expiring confirmation flow before activating a subscription. Show a real confirmation-pending state only after the server accepts the request.
5. Preserve unsubscribe and suppression status, including repeated signup attempts. Do not silently reactivate an opted-out contact.
6. Set up the approved Resend contact grouping and preferences, then test duplicates, retries, timeouts, confirmation, unsubscribe, bounces and complaints.
7. Update the privacy notice to the actual provider, purposes, retention and opt-out process.
8. Validate using approved test addresses in an isolated environment. Production collection and sending require separate release approval.

Resend documentation checked for this handoff: [Contacts](https://resend.com/docs/dashboard/audiences/contacts), [Segments](https://resend.com/docs/dashboard/segments/introduction), [Topics](https://resend.com/docs/dashboard/topics/introduction), and [Unsubscribe handling](https://resend.com/docs/dashboard/audiences/managing-unsubscribe-list). These are design references, not evidence that David's account is configured.

## Verification

- 227 website tests passed, including 48 new form, copy, localization and link checks.
- Final public production build, TypeScript and public-bundle isolation checks passed after social-image regeneration.
- All 12 existing public-site experience budgets passed without changing their limits. Homepage JavaScript: 15,827 raw bytes / 5,712 gzip bytes. Shared stylesheet: 63,466 raw bytes / 12,497 gzip bytes.
- Built public page chunks were checked for retired Alpha, not-live, concept-site, membership-year and assigned-serial wording; no matches.
- Social export visually inspected: 1200×630, 25,075 bytes, `public/og-preview-72ee9bd978.png`. Original generated edit and optimized production export both inspected; this does not substitute for browser layout QA.
- Existing local preview process remains running at http://127.0.0.1:4179/. Refresh it to load the rebuilt files.
- No API/database, financial-product, analytics implementation, CSP, security-header or exact-SHA deployment changes.
- Browser visual audit, narrow/mobile layout, keyboard review and native-speaker Amharic review remain outstanding.

## Social-image provenance

Tool: built-in ImageGen edit. Existing social image supplied as the edit target.

Final prompt: replace only the middle tagline with “Your next chapter,” / “connected.” and the old Replit domain with “www.samrapay.com”; preserve the Samra Pay heading, SP logo, dark background, palette, type hierarchy, margins and landscape composition; add no dates, Alpha language, banking claims or other elements.

Project source: `artifacts/samra-pay/src/assets/coming-soon/source/og-preview.png`. The original is recoverable from the base commit. The original generated output also remains in the image-generation output directory. The existing optimizer emits the production 1200×630 hashed asset; export settings are tightened to retain the existing 30 KB ceiling.

The old `public/og-preview-d3a3e08f63.png` derivative was replaced by `public/og-preview-72ee9bd978.png`; metadata references the replacement. The old image remains recoverable from Git. No other production images were changed.
