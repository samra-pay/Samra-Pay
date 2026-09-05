# Automatic public-site PR previews

Status: implementation for review; **not activated**. No production publication is added.

## David's editing workflow

1. Request site edits in one PR. The existing live site stays unchanged.
2. Open the **Samra Pay site preview** link in the PR comment on a phone or desktop.
3. Ask for changes. A passing eligible build updates the same channel URL while it exists.
4. Approve the finished revision. Production still uses the existing separately authorized, exact-SHA release controller and post-audit. A preview is not a production release, and merging never publishes production through these workflows.

The comment identifies the exact commit being shown. If a newer build fails, the old preview remains associated with its displayed SHA; it is not evidence that the latest commit passed. URLs expire seven days after their last successful channel update. Only two releases are retained per channel. Closing a PR prevents further publication; the channel expires naturally rather than giving automation deletion privileges. Expired/recreated channels may receive a new URL.

Preview URLs are **publicly shareable**, not access-controlled. Never include confidential material, credentials, customer data or unreleased financial-product claims. `X-Robots-Tag: noindex, nofollow, nosnippet` discourages indexing but is not authentication. The current production CSP and security/cache headers are preserved. No API, authentication, email collection, database, vendor, runtime SDK, DNS or application content changes are part of this PR.

## Architecture and safety

- `public-site-preview-build.yml` runs on relevant PR changes, checks out the exact PR head, installs the frozen lockfile with the existing minimum release age, runs the public build/tests and all 12 public experience budgets, then uploads one bounded JSON bundle. It has only repository-read permission, no cloud credentials, no secrets and no saved Git credentials.
- `public-site-preview-publish.yml` runs as `workflow_run` from trusted main. It never checks out or executes PR code, restores a PR cache, installs PR dependencies or sources artifact scripts. Node 24 directly imports the existing TypeScript budget evaluator from trusted main.
- Only open main-targeting, same-repository PRs from human OWNER/MEMBER/COLLABORATOR authors are eligible. Fork and bot changes remain build-only. Producer workflow changes must be merged/reviewed before subsequent site previews. Workflow identity, repository ID, run attempt, current PR SHA, immutable artifact ID and archive SHA-256 must all match.
- The archive is bounded, its digest is verified, and only `bundle.json` is read with `unzip -p`. Archive paths are never extracted. Static asset paths, file types, hashes, file sizes, counts, the public bundle boundary and trusted main's performance budgets are checked before cloud authentication. Each file is at most 1 MB (images 200 KB); the complete decoded bundle is at most 5 MB and the archive/JSON at most 8 MB.
- Google credentials are short-lived, issued only to the trusted publishing workflow through Workload Identity Federation. No Firebase CLI login, service-account key, API-key viewer role or browser runtime package is needed. Publication uses the Hosting REST API, not `firebase deploy`.
- Writes are serialized. PR state is rechecked before any cloud mutation, immediately before release, and before the PR comment. Source changes interrupt publication. GitHub and Firebase have no cross-service transaction: a change in the narrow interval after the last check can leave a prior-SHA preview briefly visible; the comment always names its SHA.
- The controller can target only `samra-pay-previews`, channel `pr-<number>`, never the site's `live` channel. All routes and all uploaded file bytes must verify before a link is posted. Route propagation is retried read-only; a failed audit does not trigger another deployment. Release evidence is retained even when post-deploy verification fails.

### Why a separate project

Firebase Hosting IAM permissions are site-level operations, not a reliable PR-channel-only permission boundary. Granting Hosting write access in `samra-pay-production` would put production in reach of the preview identity despite a workflow's channel argument. This implementation instead requires a dedicated preview-only project and refuses the existing production/staging project numbers. It does not reuse the production auditor or staging publisher.

`samra-pay-previews` is a **proposed, fixed project/site ID**, not a claim that it exists. If unavailable, review a single consistent rename of this contract, workflow and tests before activation. Do not substitute production or staging.

## One-time activation — separate administrator approval required

The PR may be merged while publishing is disabled. Build artifacts will be available without cloud setup. To enable automatic links, an administrator must approve and provision the following boundary once. This document itself does not authorize those mutations.

1. Create/verify an isolated Google Cloud project `samra-pay-previews` in organization `614833350075`, add Firebase, and initialize its default Hosting site `samra-pay-previews`. Start without attaching a billing account; use the no-billing Firebase plan and its enforced quotas. If an organization policy requires billing, stop for that spend decision. Do not enable databases, storage buckets, Cloud Run, Functions, app registrations, Analytics, custom domains or authentication. Record the real project number; do not copy a production/staging number.
2. Enable only the control APIs needed for Firebase Hosting and WIF: `firebase.googleapis.com`, `firebasehosting.googleapis.com`, `iam.googleapis.com`, `iamcredentials.googleapis.com`, `sts.googleapis.com`, `serviceusage.googleapis.com`, `cloudresourcemanager.googleapis.com`. Review any Google-managed API dependencies. No product backend is required.
3. Create `samra-preview-publisher@samra-pay-previews.iam.gserviceaccount.com`, with **no user-managed keys**. Bind a project custom role containing only `firebasehosting.sites.get` and `firebasehosting.sites.update`. Do not grant Owner, Editor, Firebase Admin, service-account administration, API key access or any role on production/staging. The administrator creates the site in advance; the publisher has no site create/delete privilege.
4. Create WIF pool `samra-public-preview`, OIDC provider `github-main`, issuer `https://token.actions.githubusercontent.com`. Map `google.subject=assertion.sub` and `attribute.repository_id=assertion.repository_id`. Keep Google's default provider audience. Set the complete condition below. The publisher's sole external service-account binding must be `roles/iam.workloadIdentityUser` for `principalSet://iam.googleapis.com/projects/<PREVIEW_PROJECT_NUMBER>/locations/global/workloadIdentityPools/samra-public-preview/attribute.repository_id/1335175962`.

   ```text
   assertion.repository_id=='1335175962' &&
   assertion.repository_owner_id=='320532147' &&
   assertion.repository=='samra-pay/Samra-Pay' &&
   assertion.ref=='refs/heads/main' &&
   assertion.event_name=='workflow_run' &&
   assertion.workflow_ref=='samra-pay/Samra-Pay/.github/workflows/public-site-preview-publish.yml@refs/heads/main' &&
   assertion.environment=='public-site-preview'
   ```

5. Create GitHub environment `public-site-preview`, restricted to main deployment branches. For automatic preview publication, do not add a routine per-run approval there. Preserve all production environment approvals. Add repository variable `SAMRA_PREVIEW_PROJECT_NUMBER` with the verified number. Do not add credentials to repository variables or secrets. Initially leave repository variable `SAMRA_PUBLIC_PREVIEWS_ENABLED` unset/false.
6. Independently read back project identity, no billing link, default Hosting site, APIs, exact role permissions/bindings, no service-account keys, provider condition/mapping and main-only environment policy. Confirm the identity has no inherited or direct production/staging grants. Record evidence and the reviewed bootstrap SHA before switching `SAMRA_PUBLIC_PREVIEWS_ENABLED` to `true`. These two repository variables were absent and the preview environment did not exist during the 2026-09-02 read-only inspection.
7. Open a disposable, same-repo human-authored **site-only** PR after this workflow is on main. Verify a successful build and publish, phone/desktop link, all eight routes, exact commit in the comment, seven-day expiry and noindex header. Push a second commit and confirm the same channel/comment updates. Close the test PR; verify rerunning the old build cannot republish it. Confirm production's finalized release ID and site content stayed unchanged. Only then record automatic previews as operational.

Do not use `firebase init hosting:github` here: its stock service-account-key setup would not preserve this keyless, preview-isolated boundary. Do not "fix" a 403 by widening permissions. Capture the denied permission, review it, and update the bounded contract if necessary.

## Disable, recovery and costs

- Kill switch: set repository variable `SAMRA_PUBLIC_PREVIEWS_ENABLED=false` and cancel any already-running preview publish. Disabling the variable alone does not stop an in-flight job. For suspected credential misuse, disable the dedicated WIF provider or remove its impersonation binding as an administrator.
- Keep the preview project unbilled unless separately approved. Hosting storage/transfer and GitHub Actions/artifact quotas still apply; preview builds are not guaranteed to be free of GitHub usage charges. Scope triggers, seven-day artifact/channel retention and two retained releases limit accumulation. No production budget or $100 boundary changes.
- Build failure: inspect the build job. No publication occurs. Do not bypass public budgets or boundary tests.
- Stale/closed/fork/bot/control-workflow-change: intentionally rejected. For a control change, merge the reviewed control PR first, then create/rebase the site-edit PR from main.
- Authentication failure: verify the one-time identity mapping/environment; there is no interactive Cloud Shell login in a routine preview run.
- Publication succeeds but audit fails: inspect `release.json`; retry read-only checks first. Do not call it verified or redeploy production.
- Channel expiry: push a new eligible site change or rerun the build for the current open PR head. A recreated channel may have a new URL.
- Repository/organization transfer: disable previews, update this additional provider's owner/repository condition and source validators, then repeat the activation audit. Do not rely only on the older staging-provider migration checklist.

## Local evidence / verification

```sh
node --test deploy/preview/*.test.mjs
pnpm --filter @workspace/samra-pay run build
SAMRA_PREVIEW_BUILD_SMOKE=true node --test deploy/preview/build-smoke.test.mjs
pnpm run test:action-pins
pnpm run test:repository-controls
pnpm run test:gcp-platform
```

No package was added, no lockfile dependency changed, and the one-day minimum release age stays intact. Preview/control tests are part of the required Linux CI job. Existing production exact-SHA controllers and public-bundle tests are unchanged.

References: [Firebase PR previews](https://firebase.google.com/docs/hosting/github-integration), [Hosting REST deployments](https://firebase.google.com/docs/hosting/api-deploy), [Hosting IAM permissions](https://firebase.google.com/docs/projects/iam/roles-predefined-product#hosting), [channel expiry](https://firebase.google.com/docs/hosting/manage-hosting-resources), [Google keyless GitHub authentication](https://github.com/google-github-actions/auth), [GitHub workflow_run trust warning](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run).
