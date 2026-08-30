import { useEffect } from "react";
import type { LocalizedText, PublicLanguage } from "@/lib/public-i18n";

export function usePublicPageMeta({
  language,
  title,
  description,
}: {
  language: PublicLanguage;
  title: LocalizedText;
  description: LocalizedText;
}) {
  useEffect(() => {
    const previousTitle = document.title;
    const metaUpdates = [
      ['meta[name="description"]', description[language]],
      ['meta[property="og:title"]', title[language]],
      ['meta[property="og:description"]', description[language]],
      ['meta[property="og:url"]', window.location.href],
      ['meta[name="twitter:title"]', title[language]],
      ['meta[name="twitter:description"]', description[language]],
    ] as const;
    const previousMeta = metaUpdates.map(([selector, content]) => {
      const element = document.querySelector<HTMLMetaElement>(selector);
      const previousContent = element?.content;
      if (element) element.content = content;
      return { element, previousContent };
    });

    document.title = title[language];

    return () => {
      document.title = previousTitle;
      previousMeta.forEach(({ element, previousContent }) => {
        if (element && previousContent !== undefined) element.content = previousContent;
      });
    };
  }, [description, language, title]);
}
