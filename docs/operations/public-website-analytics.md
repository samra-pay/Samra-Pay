# Public website analytics

Status on September 2, 2026: GA4 account, property, and web stream created;
website integration prepared for review, **not deployed or collecting data**.
David approved basic analytics setup, no advertising features, and accepting
Google Analytics Terms of Service and the Data Processing Terms. This is not
standing authorization to publish a public-edge change.

## Access and identity

- Operator and retention owner: David Haile, `me@davidhaile.com`.
- Account: Samra Pay (`406796105`).
- Property: Samra Pay — Website (`552617317`), New York reporting time, USD.
- Web stream: Samra Pay public website (`15667615640`).
- Measurement ID: `G-T4THKMM4Y5` (public identifier, not a secret).
- Canonical website: `https://www.samrapay.com`.
- [Open Analytics](https://analytics.google.com/analytics/web/#/a406796105p552617317/).

After release, use Reports for website traffic, pages, referrals, and engagement;
use Realtime to verify an opted-in visit. No historical page views can be
reconstructed from this new stream. Consent refusals, privacy signals, ad
blockers, and preview visits are deliberately excluded. Counts are consenting
browser visitors, not verified people, customers, or accounts. Because all query
parameters are dropped, UTM campaigns and advertising click IDs are not captured;
referral reporting is origin-based. Direct/unknown attribution can be expected.

## Verified account setup versus outstanding checks

Verified in the Google Analytics UI:

- All four optional account data-sharing options were unchecked at creation.
- Enhanced measurement was explicitly turned off before stream creation.
- Google signals and user-provided data collection were off (UI offered Turn on).
- No website data had been received.
- Optional marketing emails were declined.

Still required before publication:

- Reopen the stream and verify enhanced measurement remains off.
- Disable and verify property-wide advertising personalization.
- Verify event/user data retention is two months; disable reset on new activity.
- Review granular location/device settings and disable unnecessary granularity.
- Recheck account sharing settings and confirm no advertising integrations.
- Desktop/mobile visual and keyboard QA, English and Amharic.

The browser security policy service became unavailable during these remaining
settings checks. No bypass, alternate browser, or account API workaround was
used. The privacy notice describes the intended final retention settings; it
must not be published until those settings are verified.

## Collection boundary

This uses [basic consent mode](https://developers.google.com/tag-platform/security/concepts/consent-mode):
no Google tag, Google request, or cookieless analytics ping before opt-in.
The language preference and versioned consent choice stay in browser storage.
Consent lasts up to 180 days. GPC and Do Not Track override any prior grant.
Storage errors fail closed. The footer reopens preferences; rejection disables
the property, discards pending commands and clears only `samra_public_` cookies.
An already-loaded tag is not reenabled after withdrawal without a fresh page.
Withdrawal cannot retract previously delivered events.

Only the HTTPS canonical origin and enumerated public routes can load the tag.
Localhost, Firebase defaults, preview hosts, the future application, unknown
routes and private routes cannot send events, even after opt-in. Routes use
full-document links: one manually sent `page_view` per document, with automatic
page views disabled. No extra scroll, form, download, search, or outbound-click
tracking is enabled. Standard GA4 session/engagement events remain available.

The global and property configuration both override page location, title and
referrer. Locations contain only known public paths; titles are fixed public
labels; referrers contain only HTTP(S) origins. Queries, fragments, form fields,
credentials, customer IDs, financial data and application events are not sent.
GA4 uses pseudonymous cookie identifiers and processes ordinary browser/device
and approximate location information. This is not described as anonymous.

Advertising storage, advertising user data and personalization consent remain
denied. Google signals and ad personalization flags are false. Cookies are
host-only, use the `samra_public` prefix, and expire after 60 days without
refreshing. Configuration follows Google's [tag reference](https://developers.google.com/analytics/devguides/collection/ga4/reference/config)
and [disable-collection control](https://developers.google.com/tag-platform/security/guides/privacy).

## Security, performance and release

The original August 31 decision remains historical. Its September 2 amendment
locks the account, stream, configuration, consent model and retention owner;
the exact-SHA, clean-tree, review, explicit apply, independent post-audit and
prior-release rollback requirements are unchanged.

CSP allows the Google tag only at `www.googletagmanager.com/gtag/js`, plus exact
collection origins `www.google-analytics.com`, `region1.google-analytics.com`,
and `www.googletagmanager.com`. No wildcards, inline/eval relaxation, Ads origins,
frames, API, forms, authentication, databases, financial vendors, DNS changes or
new paid product are included. Google's [CSP guidance](https://developers.google.com/tag-platform/security/guides/csp)
lists broader optional destinations; additions here require another review.
If a Google endpoint changes, collection fails closed until reviewed.

Existing first-party bundle budgets are unchanged. The external Google script
loads asynchronously only after acceptance and is not counted in those local
bundle budgets. Post-consent real-browser performance is a release check, not a
claim established by a successful build.

Required release evidence:

1. Complete the account and visual checks above; review the exact candidate PR.
2. Build/test the approved full SHA and record the prior Firebase release.
3. Obtain bounded deployment approval; deploy hosting only, preserving DNS and
   the exact security/cache policies.
4. Verify exact deployed bytes, all public routes and both languages.
5. On a clean browser, verify no Google requests before choice or after reject;
   opt in, inspect one sanitized page view, and confirm it in Realtime.
6. Withdraw consent; verify no later collection and only owned cookie removal.
   Verify preview/private hosts never collect. Check mobile performance both
   before and after consent and perform the delayed clean-root check.
7. Record evidence and rollback pointer. If any boundary fails, restore the prior
   Firebase version without rebuilding.
