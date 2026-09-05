// Build-time navigation only. No SDK, token, query-string forwarding or request.
export function publicCustomerLinks(
  value: unknown,
  publicApplicationUri: string,
) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      /[\\\s]/u.test(value) ||
      /%/u.test(value)
    )
      return null;
    const publicUrl = new URL(publicApplicationUri);
    url.pathname = url.pathname.replace(/\/+$/, "") + "/";
    publicUrl.pathname = publicUrl.pathname.replace(/\/+$/, "") + "/";
    // A same-location handoff would loop back into the public entry page.
    if (url.origin === publicUrl.origin && url.pathname === publicUrl.pathname)
      return null;
    return {
      login: new URL("login", url).href,
      signup: new URL("signup", url).href,
    };
  } catch {
    return null;
  }
}

export function configuredCustomerLinks() {
  return publicCustomerLinks(
    import.meta.env.VITE_SAMRA_CUSTOMER_APP_URL,
    new URL(import.meta.env.BASE_URL, window.location.origin).href,
  );
}
