import { describe, expect, it } from "vitest";
import { normalizePublicPath, resolvePublicRoute } from "./public-routes";

describe("public coming-soon routes", () => {
  it("resolves every public editorial page and card alias", () => {
    expect(resolvePublicRoute("/")).toBe("home");
    expect(resolvePublicRoute("/features")).toBe("features");
    expect(resolvePublicRoute("/cards/co-brand")).toBe("features");
    expect(resolvePublicRoute("/values")).toBe("values");
    expect(resolvePublicRoute("/faq")).toBe("faq");
    expect(resolvePublicRoute("/blog")).toBe("blog");
    expect(resolvePublicRoute("/privacy")).toBe("privacy");
    expect(resolvePublicRoute("/terms")).toBe("terms");
  });

  it("supports trailing slashes and a configured base path", () => {
    expect(resolvePublicRoute("/values/")).toBe("values");
    expect(normalizePublicPath("/samra/faq/", "/samra/")).toBe("/faq");
    expect(resolvePublicRoute("/samra/blog/", "/samra/")).toBe("blog");
  });

  it("leaves non-coming-soon routes for the application router", () => {
    expect(resolvePublicRoute("/dashboard")).toBeNull();
    expect(resolvePublicRoute("/dashboard/settings")).toBeNull();
  });
});
