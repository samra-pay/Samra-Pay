import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  redirect: vi.fn(),
  callback: vi.fn(),
  authenticated: vi.fn(),
  token: vi.fn(),
  logout: vi.fn(),
  setToken: vi.fn(),
}));
vi.mock("@auth0/auth0-spa-js", () => ({ createAuth0Client: mocks.create }));
vi.mock("@workspace/api-client-react", () => ({
  setAuthTokenGetter: mocks.setToken,
}));
vi.mock("./public-runtime-config", () => ({
  resolveWebPublicEnvironment: () => ({
    VITE_SAMRA_DATA_MODE: "api",
    VITE_AUTH0_DOMAIN: "tenant.example",
    VITE_AUTH0_CLIENT_ID: "public-test-client",
    VITE_AUTH0_AUDIENCE: "https://api.example/development",
  }),
}));
import { CustomerAuthProvider, useCustomerAuth } from "./customer-auth";

let root: Root;
let host: HTMLDivElement;
function Probe() {
  const auth = useCustomerAuth();
  return createElement(
    "div",
    null,
    createElement("span", { id: "status" }, auth.status),
    createElement(
      "button",
      { id: "signup", onClick: () => auth.signIn("signup") },
      "Sign up",
    ),
    createElement(
      "button",
      { id: "login", onClick: () => auth.signIn() },
      "Log in",
    ),
  );
}
async function render() {
  await act(async () =>
    root.render(
      createElement(CustomerAuthProvider, null, createElement(Probe)),
    ),
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.history.replaceState({}, "", "/login");
  mocks.authenticated.mockResolvedValue(false);
  mocks.callback.mockResolvedValue({ appState: { returnTo: "/session" } });
  mocks.redirect.mockResolvedValue(undefined);
  mocks.create.mockResolvedValue({
    loginWithRedirect: mocks.redirect,
    handleRedirectCallback: mocks.callback,
    isAuthenticated: mocks.authenticated,
    getTokenSilently: mocks.token,
    logout: mocks.logout,
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});
describe("Auth0 customer entry", () => {
  it.each(["login", "signup"])(
    "passes the %s intent through the actual session bridge",
    async (intent) => {
      await render();
      await act(async () =>
        host.querySelector<HTMLButtonElement>(`#${intent}`)!.click(),
      );
      expect(mocks.redirect).toHaveBeenCalledTimes(1);
      const options = mocks.redirect.mock.calls[0][0];
      expect(options.appState.returnTo).toBe("/session");
      expect(options.authorizationParams.screen_hint).toBe(
        intent === "signup" ? "signup" : undefined,
      );
      expect(mocks.create.mock.calls[0][0]).toMatchObject({
        cacheLocation: "memory",
        useRefreshTokens: false,
      });
    },
  );
  it("processes the root callback, removes OAuth parameters and restores the intended route", async () => {
    window.history.replaceState({}, "", "/?code=synthetic&state=synthetic");
    mocks.authenticated.mockResolvedValue(true);
    await render();
    expect(mocks.callback).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe("/session");
    expect(window.location.search).toBe("");
    expect(host.querySelector("#status")?.textContent).toBe("authenticated");
    expect(mocks.setToken).toHaveBeenCalledWith(expect.any(Function));
  });
  it("returns callback failures to login without retaining credentials or an authenticated state", async () => {
    window.history.replaceState(
      {},
      "",
      "/?error=access_denied&state=synthetic",
    );
    mocks.callback.mockRejectedValue(new Error("cancelled"));
    await render();
    expect(window.location.pathname).toBe("/login");
    expect(window.location.search).toBe("");
    expect(host.querySelector("#status")?.textContent).toBe("error");
    expect(mocks.setToken).toHaveBeenCalledWith(null);
  });
});
