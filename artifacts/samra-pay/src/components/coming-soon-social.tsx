import { localized, usePublicLanguage } from "@/lib/public-i18n";

const socialLinks = [
  {
    label: "Facebook",
    href:
      import.meta.env.VITE_SAMRA_SOCIAL_FACEBOOK_URL ??
      "https://www.facebook.com/profile.php?id=61593951883521",
  },
  {
    label: "Instagram",
    href:
      import.meta.env.VITE_SAMRA_SOCIAL_INSTAGRAM_URL ??
      "https://www.instagram.com/trysamrapay/",
  },
  {
    label: "X",
    href: import.meta.env.VITE_SAMRA_SOCIAL_X_URL ?? "https://x.com/Samrapay",
  },
  {
    label: "YouTube",
    href:
      import.meta.env.VITE_SAMRA_SOCIAL_YOUTUBE_URL ??
      "https://www.youtube.com/@SamraPay",
  },
  { label: "LinkedIn", href: import.meta.env.VITE_SAMRA_SOCIAL_LINKEDIN_URL },
  { label: "TikTok", href: import.meta.env.VITE_SAMRA_SOCIAL_TIKTOK_URL },
] as const;

function SocialIcon({
  platform,
}: {
  platform: (typeof socialLinks)[number]["label"];
}) {
  const paths: Record<string, string> = {
    Facebook:
      "M13.5 22v-9h3l.45-3.5H13.5V7.25c0-1.01.28-1.7 1.73-1.7H17V2.42A23.65 23.65 0 0 0 14.42 2C11.86 2 10 3.56 10 6.43V9.5H7V13h3v9z",
    X: "M18.244 2.25h3.308l-7.227 8.26L22.827 21.75H16.17l-5.214-6.817-5.966 6.817H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231L18.244 2.25Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z",
    LinkedIn:
      "M5.37 24H.39V7.98h4.98V24ZM2.88 5.8A2.9 2.9 0 1 1 2.88 0a2.9 2.9 0 0 1 0 5.8ZM24 24h-4.97v-7.8c0-1.86-.04-4.25-2.59-4.25-2.59 0-2.99 2.02-2.99 4.11V24H8.48V7.98h4.77v2.19h.07c.66-1.26 2.29-2.59 4.7-2.59 5.02 0 5.98 3.3 5.98 7.59V24Z",
    TikTok:
      "M16 2c.3 2.5 1.7 4 4 4.4V10a10 10 0 0 1-4-1.2V16a6 6 0 1 1-6-6v3.5a2.5 2.5 0 1 0 2.5 2.5V2H16Z",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="currentColor"
    >
      {platform === "Instagram" ? (
        <>
          <rect
            x="3"
            y="3"
            width="18"
            height="18"
            rx="5.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <circle
            cx="12"
            cy="12"
            r="4.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <circle cx="17.5" cy="6.5" r="1.15" />
        </>
      ) : platform === "YouTube" ? (
        <path
          fillRule="evenodd"
          d="M21.6 5.6C21.2 4.3 20.3 4 19 3.8a58 58 0 0 0-14 0C3.7 4 2.8 4.3 2.4 5.6a25 25 0 0 0 0 12.8c.4 1.3 1.3 1.6 2.6 1.8a58 58 0 0 0 14 0c1.3-.2 2.2-.5 2.6-1.8a25 25 0 0 0 0-12.8ZM10 8.2v7.6l6.4-3.8L10 8.2Z"
        />
      ) : (
        <path d={paths[platform]} />
      )}
    </svg>
  );
}

export function ComingSoonSocialChannels() {
  const { text } = usePublicLanguage();
  return (
    <div className="coming-container coming-footer-social">
      <div>
        <h3>{text(localized("Follow Samra Pay", "Samra Payን ይከተሉ"))}</h3>
        <p>
          {text(
            localized(
              "Follow the people and stories behind Samra.",
              "ከSamra ጀርባ ያሉትን ሰዎችና ታሪኮች ይከታተሉ።",
            ),
          )}
        </p>
      </div>
      <ul
        className="coming-social-links"
        aria-label={text(
          localized("Samra Pay social channels", "የSamra Pay ማህበራዊ ሚዲያ መለያዎች"),
        )}
      >
        {socialLinks.map((social) => {
          const content = (
            <>
              <span className="coming-social-icon">
                <SocialIcon platform={social.label} />
              </span>
              <span className="coming-social-label">{social.label}</span>
            </>
          );
          return (
            <li key={social.label}>
              {social.href ? (
                <a
                  className="coming-social-link"
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${social.label}, ${text(localized("opens in a new tab", "በአዲስ ትር ይከፈታል"))}`}
                >
                  {content}
                </a>
              ) : (
                <span className="coming-social-link is-pending">
                  {content}
                  <span className="coming-social-status">
                    {text(localized("Coming soon", "በቅርቡ"))}
                  </span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
