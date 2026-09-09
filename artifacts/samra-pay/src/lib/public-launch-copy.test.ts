import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import Home from "../pages/home";
import Features from "../pages/features";
import Values from "../pages/values";
import Faq from "../pages/faq";
import Blog from "../pages/blog";
import Legal from "../pages/public-legal";
import NotFound from "../pages/public-not-found";
import { featureCopyAm } from "../content/features-am";
import { fullFaqItems, homeFaqItems } from "../content/public-faq";
import { PublicLanguageProvider } from "./public-i18n";

function read(relativePath: string) {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );
}

const retiredCopy =
  /\balpha\b|not live|no live financial|still in development|public preview|concept website|Member since 2026|Since 2026|ከ2026 ጀምሮ|በግንባታ ላይ|የሕዝብ ማሳያ/i;
const pages = [
  ["/", Home],
  ["/features", Features],
  ["/cards", Features],
  ["/cards/charge", Features],
  ["/cards/co-brand", Features],
  ["/values", Values],
  ["/faq", Faq],
  ["/blog", Blog],
  ["/privacy", Legal],
  ["/terms", Legal],
  ["/missing", NotFound],
] as const;
function markup(Page: typeof Home, language: "en" | "am") {
  localStorage.setItem("samra-language", language);
  return renderToStaticMarkup(
    createElement(PublicLanguageProvider, null, createElement(Page)),
  );
}
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("commercial launch copy", () => {
  it("keeps public navigation and section links connected to real targets", () => {
    const rendered = new Map<string, HTMLDivElement>();
    for (const [path, Page] of pages) {
      vi.spyOn(window, "location", "get").mockReturnValue(
        new URL("https://www.samrapay.com" + path) as unknown as Location,
      );
      const host = document.createElement("div");
      host.innerHTML = markup(Page, "en");
      rendered.set(path, host);
    }
    for (const [path, host] of rendered) {
      for (const link of host.querySelectorAll<HTMLAnchorElement>("a[href]")) {
        const href = link.getAttribute("href")!;
        if (!href.startsWith("/") && !href.startsWith("#")) continue;
        const url = new URL(href, "https://www.samrapay.com" + path);
        const target = rendered.get(url.pathname);
        expect(target, href).toBeDefined();
        if (url.hash)
          expect(target!.querySelector(url.hash), href).not.toBeNull();
      }
    }
  });
  it("removes retired launch status from the initial social and search metadata", () => {
    expect(read("../../index.html")).not.toMatch(retiredCopy);
  });
  for (const language of ["en", "am"] as const) {
    it(
      "renders five distinct SAMRA values with accessible translated names in " +
        language,
      () => {
        const host = document.createElement("div");
        host.innerHTML = markup(Values, language);
        const cards = [...host.querySelectorAll(".value-card")];
        expect(cards).toHaveLength(5);
        expect(
          cards
            .map(
              (card) => card.querySelector(".value-card-top span")?.textContent,
            )
            .join(""),
        ).toBe("SAMRA");
        expect(new Set(cards.map((card) => card.id)).size).toBe(5);
        for (const card of cards) {
          const label = card.querySelector("h2");
          expect(card.getAttribute("aria-labelledby")).toBe(label?.id);
          expect(label?.textContent).toBeTruthy();
          expect(
            card.querySelector(".value-card-tagline")?.textContent,
          ).toBeTruthy();
          if (language === "am") {
            expect(label?.textContent).toMatch(/[\u1200-\u137f]/);
            expect(
              card.querySelector(".value-card-tagline")?.textContent,
            ).toMatch(/[\u1200-\u137f]/);
          }
        }
        expect(host.querySelector("#value-access h2")?.textContent).toBe(
          language === "en" ? "Access" : "ተደራሽነት",
        );
        expect(
          host.querySelector("#value-accountability h2")?.textContent,
        ).toBe(language === "en" ? "Accountability" : "ተጠያቂነት");
        expect(host.querySelector(".page-cta a")?.getAttribute("href")).toBe(
          "/features",
        );
      },
    );
    it.each(pages)(
      "removes retired status copy and supplies navigation on %s in " +
        language,
      (path, Page) => {
        vi.spyOn(window, "location", "get").mockReturnValue(
          new URL("https://www.samrapay.com" + path) as unknown as Location,
        );
        const html = markup(Page, language);
        expect(html).not.toMatch(retiredCopy);
        expect(html).toContain('href="/#launch-updates"');
        expect(html).toContain('id="main-content"');
        expect(html.match(/<h1\b/g)).toHaveLength(1);
      },
    );
    it(
      "renders all four approved card designs with responsive sources in " +
        language,
      () => {
        const host = document.createElement("div");
        host.innerHTML = markup(Features, language);
        const artwork = [...host.querySelectorAll(".portfolio-card-art")];
        const approvedNames = [
          "samra-pay-charge-v1",
          "samra-pay-elite-v1",
          "samra-pay-airline-v1",
          "samra-pay-elite-100-v1",
        ];
        expect(artwork).toHaveLength(approvedNames.length);
        artwork.forEach((picture, index) => {
          const image = picture.querySelector("img")!;
          const name = approvedNames[index];
          expect(image.getAttribute("src")).toContain(`${name}-856.webp`);
          expect(image.getAttribute("width")).toBe("856");
          expect(image.getAttribute("height")).toBe("540");
          expect(image.getAttribute("alt")).toMatch(/^Samra Pay /);
          expect(image.closest('[aria-hidden="true"]')).toBeNull();
          for (const format of ["avif", "webp"]) {
            const source = picture.querySelector(
              `source[type="image/${format}"]`,
            )!;
            expect(source.getAttribute("srcset")).toContain(
              `${name}-428.${format} 428w`,
            );
            expect(source.getAttribute("srcset")).toContain(
              `${name}-856.${format} 856w`,
            );
            expect(source.getAttribute("sizes")).toBe(
              index === 3
                ? "(max-width: 720px) calc(100vw - 78px), 45vw"
                : "(max-width: 720px) calc(100vw - 78px), (max-width: 860px) 45vw, 33vw",
            );
          }
          if (language === "am")
            expect(image.getAttribute("alt")).toMatch(/[\u1200-\u137f]/);
        });
        expect(artwork[3].querySelector("img")?.getAttribute("alt")).toContain(
          language === "en" ? "sample number 001 / 100" : "የማሳያ ቁጥር 001 / 100",
        );
      },
    );
    it(
      "keeps the fourth card a distinct founding edition in " + language,
      () => {
        const host = document.createElement("div");
        host.innerHTML = markup(Features, language);
        const founder = host.querySelector("#elite-100")!;
        expect(founder).not.toBeNull();
        expect(founder.querySelector("h3")?.textContent).toBe("Samra Pay Elite 100");
        expect(founder.textContent).not.toMatch(
          /2026|Alpha|1\/100|\$495|45,000/i,
        );
        expect(founder.textContent).toContain(
          language === "en" ? "Invitation only" : "በግብዣ ብቻ",
        );
        expect(host.querySelectorAll(".portfolio-tier")).toHaveLength(4);
        expect(
          host.querySelector(".portfolio-disclosure-copy")?.textContent,
        ).toContain(language === "en" ? "not an automatic upgrade" : "በራስ-ሰር");
      },
    );
  }
  it("removes retired wording from collapsed FAQ content and bundled translations", () => {
    expect(
      JSON.stringify([fullFaqItems, homeFaqItems, featureCopyAm]),
    ).not.toMatch(retiredCopy);
    const ids = fullFaqItems.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(fullFaqItems.every(({ answer }) => answer.en && answer.am)).toBe(
      true,
    );
  });
  it("translates every portfolio copy call and card data field without silent English fallbacks", () => {
    const source = ts.createSourceFile(
      "features.tsx",
      read("../pages/features.tsx"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const translated = new Set<string>();
    const fields = new Set([
      "label",
      "headline",
      "description",
      "shortName",
      "cardLine",
      "title",
      "eyebrow",
    ]);
    function visit(node: ts.Node) {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "copy" &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      )
        translated.add(node.arguments[0].text);
      if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
        if (fields.has(node.name.text) && ts.isStringLiteral(node.initializer))
          translated.add(node.initializer.text);
        if (
          ["values", "benefits"].includes(node.name.text) &&
          ts.isArrayLiteralExpression(node.initializer)
        ) {
          for (const child of node.initializer.elements)
            if (ts.isStringLiteral(child) && child.text !== "—")
              translated.add(child.text);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    expect(
      [...translated].filter((english) => !featureCopyAm[english]),
    ).toEqual([]);
  });
  it("keeps waitlist collection behind the reviewed helper and out of browser storage and analytics", () => {
    const source = read("../components/launch-updates-form.tsx");
    expect(source).toContain("subscribePublicWaitlist");
    expect(source).not.toMatch(
      /fetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB|gtag\(|dataLayer|api\.resend\.com|RESEND_API_KEY/,
    );
  });
});
