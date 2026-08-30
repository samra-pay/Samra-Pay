import type { PublicRoute } from "./public-routes";

export function loadPublicPage(route: PublicRoute | null) {
  switch (route) {
    case "home":
      return import("../pages/home");
    case "features":
      return import("../pages/features");
    case "values":
      return import("../pages/values");
    case "faq":
      return import("../pages/faq");
    case "blog":
      return import("../pages/blog");
    case "privacy":
    case "terms":
      return import("../pages/public-legal");
    default:
      return import("../pages/public-not-found");
  }
}

export function loadKnownPublicPage(route: PublicRoute | null) {
  return route === null ? null : loadPublicPage(route);
}
