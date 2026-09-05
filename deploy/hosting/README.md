# Inspect the current production website

The six approved Nano Banana Pro people images were merged in
[PR 169](https://github.com/haileleuld87/Samra-Pay/pull/169), reviewed at
`dbea350cd5257d2006fb540399cad4b7f994535c`. Their merged source does not prove
that the current public site uses the same application baseline. Before an
image-only release, capture the actual live Hosting version, configuration,
and complete file manifest with [inspect-live.mjs](inspect-live.mjs).

The existing [static release controller](../gcp/activate-coming-soon-static-hosting.sh)
delegates to the public waitlist controller, which can create or configure
the waitlist runtime and its access. It is not an image-only publishing command.
This inspector has no deployment mode.

## Run from an existing signed-in Cloud Shell

Use Node 24. No package install is needed. If the private repository is not
already available in Cloud Shell, upload just `inspect-live.mjs` through the
Cloud Shell menu. Uploading to the home directory permits this command:

```sh
node "$HOME/inspect-live.mjs" \
  --operator "$(gcloud auth list --filter=status:ACTIVE --format='value(account)')" \
  --output "$HOME/samra-hosting-live-20260905.json"
```

When running from this repository instead, replace the script path with
`deploy/hosting/inspect-live.mjs`. The operator argument must match the active
Google account. The script refuses configured impersonation and uses only that
existing account's short-lived token privately. It does not log in, grant
permissions, or change the selected project. All Hosting reads explicitly
target `samra-pay-production` (project number `382465561715`), even when the
console currently displays staging.

Download the resulting JSON file through Cloud Shell and return it to the
release review. It includes release names, configuration and file hashes;
it excludes the access token and operator email. It is created with owner-only
permissions and will not overwrite an existing file. If access fails, return
the short error message; do not grant broader permissions or supply a token.

## What the inspection establishes

- Fixed production site identity and the current `live` channel release.
- A finalized version, its ordered configuration, and all active file hashes.
- A second channel read to reject a release that changed during inspection.

The release message is a provenance clue, not proof of a source revision.
Hosting file hashes identify uploaded **gzip-compressed bytes**, so a different
compression setting can produce a different hash for identical public content.
Establish the live source/artifact match before preparing a publishing command.
Preserve the exact current configuration and rollback version, review the
rendered mobile/desktop candidate, and verify the existing performance budgets.
No live inspection or publication is evidenced by the offline tests below.

## Offline verification

```sh
node --test deploy/hosting/inspect-live.test.mjs
```

The tests cover the GET-only boundary, production/channel identity, finalized
state, complete pagination, unsafe file paths, changing releases, response
limits, private authentication handling, and sanitized failures. The normal
`test:gcp-platform` command also includes these tests.

Schema references:
[current channel release](https://firebase.google.com/docs/reference/hosting/rest/v1beta1/sites.channels),
[version files](https://firebase.google.com/docs/reference/hosting/rest/v1beta1/sites.versions.files/list),
[release listing scope](https://firebase.google.com/docs/reference/hosting/rest/v1beta1/sites.releases/list).
