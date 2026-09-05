export type PublicRoute =
  | "login"
  | "signup"
  | "home"
  | "features"
  | "values"
  | "faq"
  | "blog"
  | "privacy"
  | "terms";

export function normalizePublicPath(pathname: string, basePath = "/"): string {
  const normalizedBase =
    basePath === "/" ? "/" : `/${basePath.replace(/^\/+|\/+$/g, "")}`;
  let path = pathname || "/";

  if (
    normalizedBase !== "/" &&
    (path === normalizedBase || path.startsWith(`${normalizedBase}/`))
  ) {
    path = path.slice(normalizedBase.length) || "/";
  }

  if (!path.startsWith("/")) path = `/${path}`;
  if (path.length > 1) path = path.replace(/\/+$/g, "");
  return path || "/";
}

export function resolvePublicRoute(
  pathname: string,
  basePath = "/",
): PublicRoute | null {
  const path = normalizePublicPath(pathname, basePath);

  if (path === "/login") return "login";
  if (path === "/signup") return "signup";
  if (path === "/") return "home";
  if (
    ["/features", "/cards", "/cards/charge", "/cards/co-brand"].includes(path)
  )
    return "features";
  if (path === "/values") return "values";
  if (path === "/faq") return "faq";
  if (path === "/blog") return "blog";
  if (path === "/privacy") return "privacy";
  if (path === "/terms") return "terms";
  return null;
}
