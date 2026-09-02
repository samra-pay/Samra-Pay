# Public coming-soon performance evidence

## Decision

The optimized public build meets the pre-deployment byte, cache, LCP, and CLS
targets. This evidence does not claim that the candidate is deployed. Immutable
and Brotli response headers remain a post-deployment release gate.

## Method

- **Before:** the currently deployed Firebase site at
  `https://samra-pay-production.web.app/`.
- **After:** the production build served locally with the exact cache policy in
  `firebase.json` and Brotli compression for text assets.
- **Viewports:** 390 x 844 mobile and 1440 x 900 desktop, device scale factor 1.
- **First load:** browser cache bypassed.
- **Repeat static bytes:** image, JavaScript, and CSS transfer bytes after a
  reload with the same browser cache. The HTML document remains deliberately
  non-cacheable and is excluded from this column.
- **Route bytes:** same-origin bytes only. Google Fonts are excluded because
  they are not Firebase egress.

## Route transfer: before and after

| Viewport | Route       | Before first load | Before repeat total | After first load | After repeat total | After image bytes | After repeat static |
| -------- | ----------- | ----------------: | ------------------: | ---------------: | -----------------: | ----------------: | ------------------: |
| Mobile   | `/`         |       4,444,412 B |               657 B |        161,090 B |            1,115 B |          82,203 B |                 0 B |
| Mobile   | `/features` |         462,126 B |               657 B |        122,751 B |            1,115 B |          40,427 B |                 0 B |
| Mobile   | `/cards`    |         462,126 B |               657 B |        122,751 B |            1,115 B |          40,427 B |                 0 B |
| Mobile   | `/values`   |       1,256,816 B |               657 B |        309,467 B |            1,115 B |         231,538 B |                 0 B |
| Mobile   | `/faq`      |         456,251 B |               657 B |        162,589 B |            1,115 B |          82,203 B |                 0 B |
| Mobile   | `/blog`     |         220,534 B |               657 B |        153,452 B |            1,115 B |          76,656 B |                 0 B |
| Mobile   | `/privacy`  |         452,101 B |               657 B |        158,454 B |            1,115 B |          82,203 B |                 0 B |
| Mobile   | `/terms`    |         452,101 B |               657 B |        158,454 B |            1,115 B |          82,203 B |                 0 B |
| Desktop  | `/`         |       4,444,412 B |               657 B |        207,525 B |            1,115 B |         128,638 B |                 0 B |
| Desktop  | `/features` |         462,126 B |               657 B |        196,414 B |            1,115 B |         114,090 B |                 0 B |
| Desktop  | `/cards`    |         462,126 B |               657 B |        196,414 B |            1,115 B |         114,090 B |                 0 B |
| Desktop  | `/values`   |       1,256,816 B |               657 B |        329,710 B |            1,115 B |         251,781 B |                 0 B |
| Desktop  | `/faq`      |         456,251 B |               657 B |        182,832 B |            1,115 B |         102,446 B |                 0 B |
| Desktop  | `/blog`     |         220,534 B |               657 B |        197,373 B |            1,115 B |         120,577 B |                 0 B |
| Desktop  | `/privacy`  |         452,101 B |               657 B |        178,697 B |            1,115 B |         102,446 B |                 0 B |
| Desktop  | `/terms`    |         452,101 B |               657 B |        178,697 B |            1,115 B |         102,446 B |                 0 B |

The mobile `/` route is 161,090 bytes from Firebase in this test, 73% below the
600,000-byte ceiling. Its 82,203 image bytes are 79% below the 400,000-byte
ceiling. Repeat image, JavaScript, and CSS transfer is zero for every route.

## Lighthouse mobile-throttled `/`

Lighthouse 12.8.2 ran against the same production build with simulated mobile
throttling.

| Metric                   | Result                         | Target        |
| ------------------------ | ------------------------------ | ------------- |
| Performance score        | 98                             | Evidence      |
| Largest Contentful Paint | 2.27 s                         | Hero image    |
| LCP element              | Optimized hero AVIF            | Hero image    |
| Cumulative Layout Shift  | 0.0117                         | Below 0.05    |
| Total transfer           | 314,604 B                      | Evidence      |
| Firebase-origin transfer | 209,553 B                      | Below 600 KB  |
| External Google Fonts    | 105,051 B, not Firebase egress | Informational |

The unthrottled browser trace independently records the optimized hero image as
the LCP element on both mobile and desktop. Home CLS was 0.0084 on mobile and
0.0057 on desktop.

## Artifact evidence

- 32 production images: 13 AVIF, 13 WebP, 5 PNG, and 1 SVG.
- Largest production image: 97,392 bytes.
- Mobile `/` candidate set: 133,758 AVIF bytes; WebP fallback: 163,668 bytes.
- No JPEG photograph, source map, public runtime configuration, or browser-side
  image optimizer ships in the public build.
- Responsive derivatives are regenerated from tracked source photographs into
  a gitignored, input-and-tool-versioned build cache. The release controller
  rejects any build that changes tracked exact-SHA source.
- OG PNG: 12,113 bytes at 1200 x 630. Largest icon PNG: 5,526 bytes.
- Public shell, home, and CSS ceilings equal the measured baseline plus 15%
  headroom. The version 3 validator fails closed on count, per-file size,
  aggregate size, source maps, and runtime configuration.

## Post-deployment release gate

After the exact candidate SHA is deployed, record these live checks before
closing the performance work:

```sh
curl -sSI https://www.samrapay.com/assets/hero-woman-coffee-640-DUx7i8hG.avif
curl -sSI -H 'Accept-Encoding: br' https://www.samrapay.com/assets/index-C9q8tkoP.js
curl -sSI -H 'Accept-Encoding: br' https://www.samrapay.com/assets/coming-soon-D2LklIXY.css
curl -sSI 'https://www.samrapay.com/?release=<FULL_GIT_SHA>'
curl -sSI 'https://www.samrapay.com/features?release=<FULL_GIT_SHA>'
curl -sSI 'https://www.samrapay.com/cards?release=<FULL_GIT_SHA>'
curl -sSI 'https://www.samrapay.com/index.html?release=<FULL_GIT_SHA>'
```

The image must return
`Cache-Control: public,max-age=31536000,immutable`. JavaScript and CSS must
return `Content-Encoding: br`. Direct `index.html` and every clean SPA route
must return `Cache-Control: no-cache,no-store,must-revalidate`. The unique
release query verifies the new Firebase configuration without being masked by
a response cached before the corrective deployment. The release controller
runs the route checks against both the default Firebase host and
`www.samrapay.com`; it also requires the deployed image content type and SHA-256
to match the exact local hashed asset so a rewritten missing asset cannot pass.
