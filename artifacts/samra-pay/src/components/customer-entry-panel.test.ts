import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicLanguageProvider } from "../lib/public-i18n";
import PublicCustomerEntry from "../pages/public-customer-entry";
import { ComingSoonHeader } from "./coming-soon-shell";

afterEach(() => {
  vi.unstubAllEnvs();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
});
function render(page = PublicCustomerEntry) {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(
    createElement(PublicLanguageProvider, null, createElement(page)),
  );
  return host;
}
describe("public account entry pages", () => {
  it.each(["login", "signup"])(
    "renders the %s page without collecting credentials or linking to an unconfigured service",
    (intent) => {
      vi.stubEnv("VITE_SAMRA_CUSTOMER_APP_URL", "");
      window.history.replaceState({}, "", `/${intent}`);
      const host = render();
      expect(host.querySelector("h1")?.textContent).toBe(
        intent === "signup" ? "Create your account" : "Welcome back",
      );
      expect(host.querySelector("input, form")).toBeNull();
      expect(host.querySelector('[role="status"]')?.textContent).toContain(
        "not open yet",
      );
      expect(host.querySelector('a[href="/#launch-updates"]')).not.toBeNull();
      expect(
        host.querySelector(
          `a[href="/${intent === "signup" ? "login" : "signup"}"]`,
        ),
      ).not.toBeNull();
    },
  );
  it("links to the configured service without forwarding a callback query or referrer", () => {
    vi.stubEnv(
      "VITE_SAMRA_CUSTOMER_APP_URL",
      "https://customer.example/staging/",
    );
    window.history.replaceState({}, "", "/signup?state=private&code=private");
    const link = render().querySelector<HTMLAnchorElement>(
      ".customer-entry-primary",
    )!;
    expect(link.href).toBe("https://customer.example/staging/signup");
    expect(link.getAttribute("referrerpolicy")).toBe("no-referrer");
  });
  it("shows account navigation only with a valid configured handoff", () => {
    vi.stubEnv("VITE_SAMRA_CUSTOMER_APP_URL", "");
    expect(
      render(ComingSoonHeader).querySelector('a[href="/signup"]'),
    ).toBeNull();
    vi.stubEnv("VITE_SAMRA_CUSTOMER_APP_URL", "https://customer.example/");
    expect(
      render(ComingSoonHeader).querySelector('a[href="/signup"]'),
    ).not.toBeNull();
  });
  it("renders Amharic account entry copy", () => {
    localStorage.setItem("samra-language", "am");
    window.history.replaceState({}, "", "/signup");
    expect(render().querySelector("h1")?.textContent).toBe("መለያዎን ይፍጠሩ");
  });
});
