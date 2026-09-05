# Nano Banana Pro people refresh — September 5, 2026

All six people images used by the current public website have replacement sources prepared locally. David's selected Nano Banana Pro coffee hero is reused, and five additional images were generated with the same model. The public production build passes the existing byte budgets. This report records local validation for the reviewed image update; rendered browser review remains before release.

## Review and reuse

- [Six-image comparison gallery](../../artifacts/samra-pay/creative/people/index.html)
- [People reference library and reuse instructions](../../artifacts/samra-pay/creative/people/README.md)
- [Actor manifest, prompts, task IDs and checksums](../../artifacts/samra-pay/creative/people/manifest.json)
- [Prepared source and production-build verification record](./nano-banana-people-refresh-20260905.json)

The reusable actor references are sufficient for still images and future creative artifacts. [Runway Characters](https://docs.dev.runwayml.com/characters/) is a separate product for live conversational avatars; no avatar resource is required or created here. Appearance continuity must still be reviewed for each future generated scene. Creative role names in the library are not customer identities or testimonial claims.

## Scope and provenance

Website base revision: `5bf1659413a8a3918a3fa3b58829d98c1bd47470`. The original reference images were captured at `eefac625c83d1708c7f97f063f7b1358f9471a25`; their source hashes are unchanged on the newer base. David approved moving forward with the six-image set on September 5.

Local branch: `codex/nano-banana-people-assets`.

Model: Google Nano Banana Pro through Runway, API identifier `gemini_image3_pro`. The [current models documentation](https://docs.dev.runwayml.com/guides/models/) and [API schema](https://docs.dev.runwayml.com/api.md) govern requests.

| Reference ID | Website source | Pages | Website dimensions | New credits |
| --- | --- | --- | --- | ---: |
| `coffee-hero` | `hero-woman-coffee.png` | `/` | 1200 × 1499 | 0; reused selection |
| `cafe-professional` | `proof-man-laptop.png` | `/` | 1200 × 675 | 40 |
| `diaspora-phone` | `woman-with-phone-diaspora.jpg` | `/`, `/blog` | 1024 × 1024 | 40 |
| `values-woman` | `values-portrait-woman-v2.jpg` | `/values` | 1000 × 1000 | 40 |
| `values-man` | `values-portrait-man-v2.jpg` | `/values` | 1000 × 1000 | 40 |
| `values-elder` | `values-portrait-elder-v2.jpg` | `/values` | 1000 × 1000 | 40 |

Five successful requests returned an actual total cost of **200 credits, equivalent to $2.00 before tax**. Runway Dev MCP confirmed the project balance changed from 1,911 to 1,711 credits. There were no failed generations or automatic resubmissions in this batch. The previously generated coffee hero was not billed again.

The sources under `src/assets/coming-soon/source/` replace the existing public-site people images. The source filenames, intrinsic dimensions and compositions remain compatible with the current layout. Non-people assets, public page copy, CSS, source sets, loading attributes, preloads, cache configuration, routes and budget contract are unchanged. Dormant legacy Social House images are outside the public route loader and were not included in this website refresh.

Full-resolution JPEG references, before/after previews, saved prompts and a manifest live under `artifacts/samra-pay/creative/people/`, outside both `src/` and `public/`. Original generated PNGs and accepted task records remain in the ignored local `tools/runway-hero/output/` directory. Creative masters are not website downloads.

## Performance evidence

Baseline and candidate were built locally from the same base revision and locked dependencies. These are build-time measurements, not live-site timing or browser transfer measurements. Gzip values use level 9, matching the existing experience-budget validator. Units below are decimal bytes.

| Existing check | Baseline | Candidate | Existing limit | Result |
| --- | ---: | ---: | ---: | --- |
| Home mobile images, four 640px AVIFs | 133,758 B | 136,742 B | 400,000 B combined | Pass |
| Home mobile images, four 640px WebPs | 163,668 B | 168,678 B | 400,000 B combined | Pass |
| Home first-load gzip proxy | 218,749 B | 221,740 B | 575,000 B combined | Pass |
| Entry JavaScript, raw / gzip | 195,351 / 62,609 B | 195,351 / 62,610 B | 240,000 / 80,000 B | Pass |
| Public shell JavaScript, raw / gzip | 8,912 / 3,453 B | 8,912 / 3,453 B | 13,059 / 4,903 B | Pass |
| Home JavaScript, raw / gzip | 13,204 / 4,805 B | 13,204 / 4,805 B | 16,125 / 5,733 B | Pass |
| Public CSS, raw / gzip | 64,653 / 12,700 B | 64,653 / 12,700 B | 68,706 / 13,562 B | Pass |
| Production image count | 32 | 32 | Exactly 32 | Pass |

The mobile AVIF image set increases by **2,984 B (2.23%)**. The first-load gzip proxy increases by **2,991 B (1.37%)**. Small JavaScript gzip differences result from changed asset references; raw JavaScript and CSS sizes are unchanged. Total production image storage across all formats and sizes is 1,391,311 B; browsers select individual variants rather than downloading that entire set.

All 26 generated AVIF/WebP derivatives pass their unchanged per-image limits: hero 100 KB, laptop 60 KB, Values portraits 70 KB, phone 90 KB and pattern 80 KB. The largest new derivative is the 1200px hero WebP at **97,734 B**. Its WebP quality is set to 58 at that width to fit the existing 100 KB limit; the 640px and 960px WebP variants retain quality 70, and AVIF retains quality 54. No image limit was raised.

The refreshed baseline and candidate budget reports (`baseline-current-main-budgets.json` and `candidate-current-main-budgets.json`) are saved under `tools/runway-hero/output/people-refresh/`. All **12 public-site budget checks passed**, including the absence of legacy authentication/onboarding chunks, source maps and runtime configuration. Operations and native mobile bundles are unchanged and were not rebuilt for this image-only change.

## Validation and remaining release work

Completed:

- Public image optimizer: all image limits passed.
- Application tests: **23 files, 236 tests passed**.
- Production Vite build: passed.
- Public-build boundary: passed.
- Application TypeScript check: passed after generating the local referenced API-client declarations.
- Static asset inspection: six source/master hashes and dimensions match the manifest; all extracted production image/asset references resolve; all gallery file links resolve.
- Distribution inspection: no creative masters, JPEG sources or Runway secret material in the production output.
- Visual image-file review: new faces, hands and framing inspected, including the compressed hero fallback. This is not a rendered-page review.
- Whitespace/diff validation: passed.

The browser URL policy blocked opening the local review page. No alternate browser route was used after that policy block. Fresh page screenshots, 320/390/1440px layout checks, LCP, CLS, actual browser transfer and cache behavior are therefore **not verified in this run**. Prior Lighthouse results in the repository are historical and do not establish this candidate's browser performance.

Before publication, review the six-image gallery, check the built home, blog and Values pages at narrow/mobile/desktop widths, and perform the normal browser performance and cache verification against the unchanged website guidelines. Release still requires review of the exact final source revision and explicit publication authorization.

Prepared source-asset digest (the six images plus optimizer):
`a1829493757e3d10aada191136b3c21a50b68e65db361e9a79a2ec79ef0c0f0f`

Production-build digest (sorted relative paths, sizes and SHA-256 hashes):
`be8a07d1576b9155c539f0de53dedc0cc68903db73cc02c35e8aad251d1df686`

The JSON verification record lists every included source and production file. These digests identify the locally tested source assets and build bytes. They are not a deployed release ID; Git commit identity is recorded separately in the pull request.

## Production publication boundary

The current `activate-coming-soon-static-hosting.sh` delegates to `activate-public-waitlist-release.sh`. Its apply path can grant IAM, build a backend image and deploy Cloud Run before publishing Firebase Hosting. It is not a hosting-only image update and must not be run merely to publish these photos. Use a reviewed, hosting-only path that preserves the verified current production configuration and records the prior release. The six-image approval does not enable waitlist services or change identity, database, DNS or vendor configuration.

Automatic PR preview publication is currently disabled: the repository has no `SAMRA_PUBLIC_PREVIEWS_ENABLED` or `SAMRA_PREVIEW_PROJECT_NUMBER` variable. The existing PR workflow can still produce a build artifact without cloud credentials. No preview project activation is included in this change.
