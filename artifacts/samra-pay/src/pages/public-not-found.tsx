import { ArrowLeft, Compass } from "lucide-react";
import { tibebPattern } from "@/assets/coming-soon/images";
import {
  ComingSoonFooter,
  ComingSoonHeader,
} from "@/components/coming-soon-shell";
import { OptimizedPicture } from "@/components/optimized-picture";
import { localized, usePublicLanguage } from "@/lib/public-i18n";
import { usePublicPageMeta } from "@/lib/public-page-meta";
import "./coming-soon.css";

const notFoundMeta = {
  title: localized("Page not found — Samra Pay", "ገጹ አልተገኘም — Samra Pay"),
  description: localized(
    "The requested Samra Pay public page could not be found.",
    "የጠየቁት የSamra Pay የሕዝብ ገጽ አልተገኘም።",
  ),
};

export default function PublicNotFound() {
  const { language, text } = usePublicLanguage();
  usePublicPageMeta({ language, ...notFoundMeta });

  return (
    <div
      className={`coming-soon-site editorial-page public-not-found ${language === "am" ? "is-amharic" : ""}`}
      id="top"
      lang={language}
    >
      <ComingSoonHeader />
      <main id="main-content" tabIndex={-1}>
        <section className="not-found-panel" aria-labelledby="not-found-title">
          <OptimizedPicture
            asset={tibebPattern}
            alt=""
            aria-hidden="true"
            className="not-found-pattern"
            pictureClassName="public-picture-contents"
            decoding="async"
          />
          <div className="coming-container not-found-panel-content">
            <Compass aria-hidden="true" />
            <p>404</p>
            <h1 id="not-found-title">
              {text(
                localized("Let’s find your way back.", "ወደ ትክክለኛው ገጽ እንመለስ።"),
              )}
            </h1>
            <span>
              {text(
                localized(
                  "We couldn’t find this page. Explore the card portfolio, get answers, or head back to the homepage.",
                  "ይህን ገጽ ማግኘት አልቻልንም። የካርድ ስብስቡን ያስሱ፣ መልሶችን ያግኙ ወይም ወደ መነሻ ገጽ ይመለሱ።",
                ),
              )}
            </span>
            <a className="portfolio-primary-link" href="/">
              <ArrowLeft aria-hidden="true" />
              {text(localized("Back to home", "ወደ መነሻ ይመለሱ"))}
            </a>
          </div>
        </section>
      </main>
      <ComingSoonFooter />
    </div>
  );
}
