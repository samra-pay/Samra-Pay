import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const platforms = [
  "FACEBOOK",
  "INSTAGRAM",
  "X",
  "YOUTUBE",
  "LINKEDIN",
  "TIKTOK",
] as const;

async function render() {
  const [{ PublicLanguageProvider }, { ComingSoonSocialChannels }] =
    await Promise.all([
      import("../lib/public-i18n"),
      import("./coming-soon-social"),
    ]);
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(
    createElement(
      PublicLanguageProvider,
      null,
      createElement(ComingSoonSocialChannels),
    ),
  );
  return host;
}

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
  for (const platform of platforms) {
    vi.stubEnv(`VITE_SAMRA_SOCIAL_${platform}_URL`, undefined);
  }
});

afterEach(() => {
  localStorage.clear();
  vi.unstubAllEnvs();
});

describe("public social channels", () => {
  it("retains the four verified destinations with named, safe new-tab links", async () => {
    const host = await render();
    const links = Array.from(host.querySelectorAll("a"));

    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "https://www.facebook.com/profile.php?id=61593951883521",
      "https://www.instagram.com/trysamrapay/",
      "https://x.com/Samrapay",
      "https://www.youtube.com/@SamraPay",
    ]);
    expect(links.map((link) => link.textContent?.trim())).toEqual([
      "Facebook",
      "Instagram",
      "X",
      "YouTube",
    ]);
    for (const link of links) {
      expect(link.target).toBe("_blank");
      expect(link.relList.contains("noopener")).toBe(true);
      expect(link.relList.contains("noreferrer")).toBe(true);
      expect(link.getAttribute("aria-label")).toBe(
        `${link.textContent?.trim()}, opens in a new tab`,
      );
    }
  });

  it.each([
    { language: "en", status: "Coming soon" },
    { language: "am", status: "በቅርቡ" },
  ])(
    "keeps LinkedIn and TikTok visible and noninteractive in $language",
    async ({ language, status }) => {
      localStorage.setItem("samra-language", language);
      const host = await render();
      const items = Array.from(host.querySelectorAll("li"));

      expect(items).toHaveLength(6);
      for (const platform of ["LinkedIn", "TikTok"]) {
        const item = items.find((entry) =>
          entry.textContent?.includes(platform),
        );
        expect(item).toBeDefined();
        expect(item!.textContent).toContain(status);
        expect(
          item!.querySelector(
            'a, button, [href], [tabindex], [role="link"], [role="button"]',
          ),
        ).toBeNull();
      }
      expect(host.querySelectorAll("a")).toHaveLength(4);
      if (language === "am") {
        expect(host.textContent).not.toContain("Coming soon");
        expect(host.querySelector("a")?.getAttribute("aria-label")).toBe(
          "Facebook, በአዲስ ትር ይከፈታል",
        );
      }
    },
  );

  it("keeps every platform icon decorative beside its visible name", async () => {
    const host = await render();
    const items = Array.from(host.querySelectorAll("li"));

    expect(host.querySelectorAll("svg")).toHaveLength(6);
    for (const item of items) {
      const icon = item.querySelector("svg");
      expect(icon?.getAttribute("aria-hidden")).toBe("true");
      expect(icon?.getAttribute("focusable")).toBe("false");
      expect(icon?.hasAttribute("tabindex")).toBe(false);
      expect(
        item.querySelector(".coming-social-label")?.textContent,
      ).toBeTruthy();
    }
  });

  it("uses an explicitly configured TikTok URL while LinkedIn stays pending", async () => {
    vi.stubEnv(
      "VITE_SAMRA_SOCIAL_TIKTOK_URL",
      "https://www.tiktok.com/@trysamrapay",
    );
    const host = await render();
    const items = Array.from(host.querySelectorAll("li"));
    const tiktok = items.find((item) => item.textContent?.includes("TikTok"))!;
    const linkedin = items.find((item) =>
      item.textContent?.includes("LinkedIn"),
    )!;

    expect(host.querySelectorAll("a")).toHaveLength(5);
    expect(tiktok.querySelector("a")?.getAttribute("href")).toBe(
      "https://www.tiktok.com/@trysamrapay",
    );
    expect(tiktok.textContent).not.toContain("Coming soon");
    expect(linkedin.querySelector("a")).toBeNull();
    expect(linkedin.textContent).toContain("Coming soon");
  });
});
