import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  redirect: vi.fn(),
  callback: vi.fn(),
  authenticated: vi.fn(),
  token: vi.fn(),
  logout: vi.fn(),
  setToken: vi.fn(),
  mode: "api",
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
vi.mock("./samra-runtime", () => ({ useSamraDataMode: () => mocks.mode }));
import { CustomerAuthProvider, useCustomerAuth } from "./customer-auth";
import { PublicLanguageProvider } from "./public-i18n";
import Login from "../pages/login";

let root: Root;
let host: HTMLDivElement;
let queryClient: QueryClient;
function Probe() {
  queryClient = useQueryClient();
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
    createElement(
      "button",
      { id: "logout", onClick: () => auth.signOut() },
      "Log out",
    ),
  );
}
async function render(child = createElement(Probe)) {
  const content = createElement(
    QueryClientProvider,
    { client: queryClient },
    createElement(CustomerAuthProvider, null, child),
  );
  await act(async () => root.render(content));
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.mode = "api";
  localStorage.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.history.replaceState({}, "", "/login");
  mocks.authenticated.mockResolvedValue(false);
  mocks.callback.mockResolvedValue({ appState: { returnTo: "/session" } });
  mocks.redirect.mockResolvedValue(undefined);
  mocks.logout.mockResolvedValue(undefined);
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
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
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
      await render(
        createElement(
          PublicLanguageProvider,
          null,
          createElement(Login, { signup: intent === "signup" }),
        ),
      );
      await act(async () => {
        host
          .querySelector("form")!
          .dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
          );
      });
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

  it("clears customer queries and mutations even when provider logout fails", async () => {
    mocks.authenticated.mockResolvedValue(true);
    await render();
    queryClient.setQueryData(["samra", "customer"], { id: "synthetic-a" });
    await queryClient
      .getMutationCache()
      .build(queryClient, {
        mutationFn: async () => ({ walletId: "synthetic-wallet-a" }),
      })
      .execute(undefined);
    let finishQuery!: (value: unknown) => void;
    const pendingQuery = queryClient
      .fetchQuery({
        queryKey: ["samra", "onboarding"],
        queryFn: () =>
          new Promise((resolve) => {
            finishQuery = resolve;
          }),
      })
      .catch(() => undefined);
    mocks.logout.mockRejectedValue(new Error("provider unavailable"));
    await act(async () =>
      host.querySelector<HTMLButtonElement>("#logout")!.click(),
    );
    finishQuery({ customerId: "synthetic-a" });
    await pendingQuery;
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
    expect(mocks.setToken).toHaveBeenLastCalledWith(null);
    expect(mocks.logout).toHaveBeenCalledWith({
      logoutParams: { returnTo: window.location.origin + "/" },
    });
    expect(host.querySelector("#status")?.textContent).toBe("error");
  });

  it("rejects a token lookup that completes after logout", async () => {
    mocks.authenticated.mockResolvedValue(true);
    await render();
    const getter = mocks.setToken.mock.calls.at(
      -1,
    )![0] as () => Promise<string>;
    let finishToken!: (token: string) => void;
    mocks.token.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          finishToken = resolve;
        }),
    );
    const tokenResult = getter().then(
      () => "accepted",
      () => "rejected",
    );
    await act(async () =>
      host.querySelector<HTMLButtonElement>("#logout")!.click(),
    );
    finishToken("synthetic-token");
    expect(await tokenResult).toBe("rejected");
    await expect(getter()).rejects.toThrow();
    expect(mocks.token).toHaveBeenCalledTimes(1);
  });

  it("isolates a late mutation result from the next session cache", async () => {
    mocks.authenticated.mockResolvedValue(true);
    await render();
    const previousClient = queryClient;
    let finishMutation!: (value: { customerId: string }) => void;
    const pendingMutation = previousClient
      .getMutationCache()
      .build(previousClient, {
        mutationFn: () =>
          new Promise<{ customerId: string }>((resolve) => {
            finishMutation = resolve;
          }),
        onSuccess: (data) => {
          previousClient.setQueryData(["samra", "onboarding"], data);
        },
      })
      .execute(undefined);
    await act(async () => {});
    mocks.logout.mockRejectedValue(new Error("provider unavailable"));
    await act(async () =>
      host.querySelector<HTMLButtonElement>("#logout")!.click(),
    );
    await act(async () => {
      finishMutation({ customerId: "synthetic-old-account" });
      await pendingMutation;
    });
    expect(queryClient.getQueryData(["samra", "onboarding"])).toBeUndefined();
  });

  it("ignores an obsolete initialization failure after a new session is established", async () => {
    let failOldInitialization!: (cause: Error) => void;
    mocks.create.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          failOldInitialization = reject;
        }),
    );
    mocks.authenticated.mockResolvedValue(true);
    await render();
    await act(async () => root.unmount());
    root = createRoot(host);
    await render();
    expect(host.querySelector("#status")?.textContent).toBe("authenticated");
    await act(async () =>
      failOldInitialization(new Error("obsolete initialization")),
    );
    expect(mocks.setToken).toHaveBeenLastCalledWith(expect.any(Function));
    expect(host.querySelector("#status")?.textContent).toBe("authenticated");
  });

  it("opens managed password recovery from the login page without collecting credentials", async () => {
    await render(
      createElement(PublicLanguageProvider, null, createElement(Login)),
    );
    expect(host.querySelector("input")).toBeNull();
    expect(host.textContent).toContain("Access is by invitation.");
    expect(
      host.querySelector("#customer-recovery-help")?.textContent,
    ).toContain("recover access with Google");
    const recovery = host.querySelector<HTMLButtonElement>(
      '[aria-describedby="customer-recovery-help"]',
    )!;
    await act(async () => recovery.click());
    expect(mocks.redirect).toHaveBeenCalledWith({
      appState: { returnTo: "/session" },
      authorizationParams: {
        audience: "https://api.example/development",
        redirect_uri: window.location.origin + "/",
        prompt: "login",
      },
    });
  });

  it("keeps provider recovery errors generic and permits another attempt", async () => {
    mocks.redirect.mockRejectedValue(new Error("private-provider-error"));
    await render(
      createElement(PublicLanguageProvider, null, createElement(Login)),
    );
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          '[aria-describedby="customer-recovery-help"]',
        )!
        .click(),
    );
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Please try again.",
    );
    expect(host.textContent).not.toContain("private-provider-error");
    expect(
      host.querySelector<HTMLButtonElement>(
        '[aria-describedby="customer-recovery-help"]',
      )!.disabled,
    ).toBe(false);
  });

  it("does not advertise account recovery in a synthetic demo", async () => {
    mocks.mode = "mock";
    await render(
      createElement(PublicLanguageProvider, null, createElement(Login)),
    );
    expect(host.querySelector("#customer-recovery-help")).toBeNull();
    expect(host.textContent).toContain("synthetic walkthrough");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
