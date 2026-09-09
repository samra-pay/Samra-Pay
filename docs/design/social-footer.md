# Public social footer

Decision owner: David Haile. Updated September 9, 2026.

The public footer shows six named social panels. Preserve the four existing,
previously verified account destinations:

| Platform  | Default destination                                    |
| --------- | ------------------------------------------------------ |
| Facebook  | https://www.facebook.com/profile.php?id=61593951883521 |
| Instagram | https://www.instagram.com/trysamrapay/                 |
| X         | https://x.com/Samrapay                                 |
| YouTube   | https://www.youtube.com/@SamraPay                      |

David requested LinkedIn and TikTok as website placeholders for this release.
Both remain visible with **Coming soon** / **በቅርቡ** and no link, button, keyboard
stop, or artificial destination. This is a website presentation decision; it
does not assert that either social account exists or does not exist.

Configured destinations open in a new tab, with visible platform names,
localized new-tab labels and `noopener noreferrer`. Platform SVGs are decorative.
Keyboard focus and reduced-motion styling accompany the responsive panel layout.
The implementation is in
[ComingSoonSocialChannels](../../artifacts/samra-pay/src/components/coming-soon-social.tsx).

Existing `VITE_SAMRA_SOCIAL_<PLATFORM>_URL` build variables remain supported.
Leave LinkedIn and TikTok unset in this candidate to preserve the approved
placeholder state. A future verified, approved URL can turn either panel into a
link through the existing configuration path. Do not use `#`, a platform homepage,
or an assumed account URL as a substitute.

## Verification and release status

As of this source change, the updated panels are **prepared, not yet verified
live**. The [render tests](../../artifacts/samra-pay/src/components/coming-soon-social.test.ts)
cover the four exact destinations, safe new-tab links, both placeholder languages,
noninteractive placeholders, decorative icons and a configured TikTok destination.
Run the website test/build/typecheck and visually inspect desktop, narrow mobile,
English and Amharic layouts before publication. Record exact release and live
read-back evidence separately; this document alone is not deployment evidence.
