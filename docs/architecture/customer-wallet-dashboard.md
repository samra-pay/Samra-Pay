# Customer wallet dashboard

Status: implemented for review, 2026-09-07. No deployment or provider activation.
Owner: David Haile. Scope approved in the Crossmint starter-app review.

## Outcome and boundary

The authenticated customer build has a read-only `/wallet` route, linked from
wallet-ready onboarding. It adapts the dashboard, wallet-details and activity
composition from Crossmint's fintech starter at
`742d12bbad5d74b68bc7564e474ad4853bb347f3` into Samra's React/Vite application
and shared design system. The upstream MIT notice ships at
`/licenses/crossmint-fintech-starter.txt`.

Auth0 remains the sign-in boundary. On each page entry or refresh the page
checks Samra onboarding before retrieving the caller's normalized wallet.
It never accepts customer IDs or wallet addresses from a URL or browser store.
The existing authenticated API owns customer-to-wallet authorization.
Pending access checks, failed refreshes and restricted onboarding hide cached
wallet details. Restricted/error wallet records do not expose an address.
The page never creates a wallet or calls a financial/provider endpoint.

Wallet details show the asset, network, public address when supplied, and
Samra wallet reference. Copying an address requires a click and reports
clipboard failures. Synthetic and staging records have explicit labels.
Wallet readiness does not claim signer enrollment or financial activation.

## Balance and activity gap

The current wallet contract exposes lifecycle and address metadata, with no
balance or transaction history. The dashboard therefore displays **Unavailable**
for both. It does not show zero, fabricate an empty history, treat a USD account
as a USDC wallet balance, or use a browser Crossmint SDK as accounting truth.
Add-money and send controls stay disabled under the existing Alpha Release 1
scope. This is a limitation of this first integration, not live wallet proof.

A following slice needs reviewed Samra-owned balance/activity contracts and
provider reconciliation before these panels can display financial data.
The separate staging activation requires a deployed authenticated API and a
durable customer mapping; a console-created wallet alone is not sufficient.
No provider credentials, SDK, schema, runtime flags or deployment changed here.

## Acceptance

- Render a ready synthetic or staging-shaped record from the authenticated
  onboarding source, including an API-supplied address only.
- Deny detail display for restricted onboarding and wallet states.
- Hide previous data while refreshing, on 401/403, and on network failure.
- Re-entering the page retrieves the same server mapping; no creation command.
- Missing address, unavailable balance/activity, clipboard failure and narrow
  screens remain usable without inventing financial data.
- Validate with customer component tests, typecheck, customer build and the
  existing design-system checks. Synthetic fixtures are not provider acceptance.

See [wallet ownership](customer-wallet-crossmint.md) and
[Alpha Release 1](alpha-release-1.md) for activation and signing gates.
