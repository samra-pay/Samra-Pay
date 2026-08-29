# Public coming-soon release

Status: Git-ready locally; no GitHub push, Google Cloud mutation, public traffic, certificate request, or DNS change has been executed.

## Decision

Publish only the Samra Pay coming-soon customer website. Do not expose the API, Operations Portal, design-system preview, login, onboarding, or dashboard through the public edge.

Use the repository's prepared Cloud Run public-edge pattern: a global external Application Load Balancer, Cloud Armor, a serverless NEG, a reserved global IP address, and a Google-managed certificate in front of `samra-customer-web`. Google recommends this load-balancer path for production Cloud Run custom domains; direct Cloud Run domain mapping remains a preview feature and is not recommended for production.

Squarespace remains the domain registrar and DNS manager. It is not the application runtime.

## Source-control state

- GitHub repository: `haileleuld87/Samra-Pay`
- Confirmed remote `main`: `e3966eedfc190170307ae6b637d3daf9046bebc3`
- Prepared public-edge base: `2c137e118a9f66e19d991e3edf5309444c5dea6d`, one commit above the confirmed remote `main`
- Local release branch: `codex/public-coming-soon`
- The release branch is not pushed and does not change remote `main`.
- The coming-soon root is isolated into its own lazy-loaded bundle. Existing authenticated and private product routes remain available in code but are not linked from the public page.

Before push:

1. Fetch and confirm that remote `main` has not advanced.
2. Review the public-edge base and coming-soon changes as one branch.
3. Run the customer-web typecheck, test suite, production build, public-edge contract tests, and offline public-readiness validator.
4. Commit only source, assets, and governing documentation. Do not commit local QA screenshots, build output, dependencies, credentials, or runtime evidence.
5. Push `codex/public-coming-soon` and open a pull request. Do not merge until protected checks and the release review pass.

## Environment gate

`samrapay.com` is a production-facing apex domain. The existing reviewed cloud contract names the synthetic-only staging project `samra-pay-staging` in `us-east4` and explicitly marks DNS and public traffic as unauthorized.

Do not point the apex domain to that staging environment by inference.

Before cloud work, make one explicit environment decision:

- Recommended: approve a production-facing public-web Google Cloud project and keep the staging project synthetic and private.
- Temporary alternative: use a staging subdomain for controlled verification, then perform a separate apex-domain production cutover.

The production project ID, billing owner, budget alert, notification channel, and infrastructure owner must be recorded before any apply step.

## Google Cloud preparation sequence

1. Build an immutable `samra-customer-web` image from the exact reviewed Git SHA.
2. Publish the image by digest; never deploy `latest`.
3. Deploy a zero-traffic customer-web revision.
4. Verify the revision, static assets, health endpoint, security headers, and rollback target without changing public traffic.
5. Provision the public edge without changing DNS:
   - reserved global IPv4 address;
   - global external Application Load Balancer;
   - Cloud Armor policy;
   - regional serverless NEG for customer web;
   - HTTPS-only frontend and HTTP-to-HTTPS redirect;
   - Google-managed certificate with DNS authorization;
   - uptime check, error-rate alert, latency alert, and notification channel.
6. Keep `samra-api`, `samra-operations-web`, and `samra-design-system-preview` private.
7. Verify the load balancer against the reserved address before domain cutover.
8. Record exact infrastructure evidence and the rollback address.

The direct Cloud Run service URL must not become the public production origin. The browser should reach customer web only through the approved load balancer.

## Squarespace DNS cutover

Do not guess DNS values. Google Cloud must generate the exact verification and serving records after the public edge exists.

### Observed public DNS snapshot

Read-only lookup on 2026-08-29 at approximately 13:32 America/New_York:

- authoritative nameservers: `nsd1.squarespacedns.com`, `nsd2.squarespacedns.com`, `nsd3.squarespacedns.com`, and `nsd4.squarespacedns.com`;
- apex A records: `198.185.159.144`, `198.185.159.145`, `198.49.23.144`, and `198.49.23.145`;
- `www` CNAME: `ext-sq.squarespace.com`;
- apex TXT: `v=spf1 -all`;
- no AAAA, MX, or CAA answer was observed in the focused lookup;
- web-record TTL: 14,400 seconds at observation time.

These values confirm that the public web records currently point to Squarespace. They are evidence for planning, not standing authority for rollback; capture the zone again immediately before any change.

Before editing Squarespace:

1. Export or capture the current DNS zone.
2. Identify existing web records for `@` and `www`.
3. Preserve MX, SPF, DKIM, DMARC, and other email or security records.
4. Confirm whether the apex or `www` is canonical. Recommendation: `samrapay.com` canonical with `www.samrapay.com` redirected to it.
5. If a lower TTL is needed, change it before the planned cutover window and record the prior value.

Cutover order:

1. Add only the Google-provided domain-verification or certificate-authorization record in Squarespace.
2. Wait for Google to validate domain control and provision the managed certificate.
3. Add the Google-provided apex and `www` serving records.
4. Remove only conflicting Squarespace web-hosting records after the replacement values are confirmed. Do not remove email records.
5. Verify both apex and `www` over HTTPS, the canonical redirect, certificate status, page title, images, navigation, FAQ, mobile layout, security headers, and absence of sign-in.
6. Monitor during the rollback window.

Rollback uses the captured pre-change Squarespace web records and the recorded prior Cloud Run revision. DNS rollback does not authorize exposing the API or another internal service.

Squarespace notes that DNS edits can take time to propagate and that conflicting records can prevent a new record from being saved. The hosting target's records govern; Squarespace's default web-hosting values do not apply when the domain points to Google Cloud.

## Release evidence required

- exact Git SHA and clean tree;
- protected CI result;
- customer-web typecheck, tests, and production build;
- public-edge contract and validator results;
- immutable image digest;
- zero-traffic revision and verification result;
- reserved IP, load balancer, NEG, Cloud Armor, and certificate identifiers;
- pre-change DNS snapshot;
- exact DNS changes, operator, time, and TTL;
- apex and `www` HTTPS verification;
- accessibility and mobile verification;
- console and network-error check;
- monitoring and alert evidence;
- rollback target and rollback test owner.

## Hard stops

- No GitHub push until the branch diff is reviewed.
- No Google Cloud apply until the production-facing project and cost boundary are approved.
- No certificate or DNS mutation until the exact domain, DNS owner, and serving records are known.
- No apex cutover to synthetic staging by default.
- No live early-access data collection until the destination, consent language, privacy notice, retention, deletion, and data-subject request process are approved.
- No claim that the public site, product, financial services, partners, or corridor are live until independently verified.

## Official references

- Google Cloud: https://cloud.google.com/run/docs/mapping-custom-domains
- Google Cloud load balancing for Cloud Run: https://cloud.google.com/load-balancing/docs/https/setting-up-https-serverless
- Squarespace DNS editing: https://support.squarespace.com/hc/en-us/articles/360002101888-Adding-DNS-records-to-your-domain
- Squarespace domain pointing: https://support.squarespace.com/hc/en-us/articles/215744668-Pointing-a-Squarespace-domain
