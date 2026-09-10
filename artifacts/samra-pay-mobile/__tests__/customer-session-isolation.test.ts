// @vitest-environment happy-dom
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  restore: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  token: vi.fn(),
  setToken: vi.fn(),
  storage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
}));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: mocks.storage,
}));
vi.mock("@workspace/api-client-react", () => ({
  setAuthTokenGetter: mocks.setToken,
}));
vi.mock("@/lib/native-auth0", () => ({
  createNativeAuth0Session: mocks.create,
}));
import { AuthProvider, useAuth } from "../context/AuthContext";

const CONFIG = Object.freeze({
  mode: "auth0-native" as const,
  domain: "auth0.ci.invalid",
  clientId: "NativeCiClient_12345678",
  audience: "https://api.ci.invalid",
  customScheme: "samrapaytestauth",
});
let root: Root;
let host: HTMLDivElement;
let parentClient: QueryClient;
let sessionClient: QueryClient;
let auth: ReturnType<typeof useAuth>;
let changeDraft: (value: string) => void;

function Probe() {
  auth = useAuth();
  sessionClient = useQueryClient();
  const [draft, setDraft] = useState("");
  changeDraft = setDraft;
  return createElement("span", { id: "draft" }, draft);
}

async function render(config = CONFIG) {
  await act(async () =>
    root.render(
      createElement(
        QueryClientProvider,
        { client: parentClient },
        createElement(AuthProvider, { config }, createElement(Probe)),
      ),
    ),
  );
}
function tokenGetter(): () => Promise<string | null> {
  return mocks.setToken.mock.calls.at(-1)![0];
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.restore.mockResolvedValue(true);
  mocks.signIn.mockResolvedValue(undefined);
  mocks.signOut.mockResolvedValue(undefined);
  mocks.token.mockResolvedValue("synthetic-token");
  mocks.create.mockResolvedValue({
    restore: mocks.restore,
    signIn: mocks.signIn,
    signOut: mocks.signOut,
    getAccessToken: mocks.token,
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  parentClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  parentClient.clear();
  host.remove();
  vi.unstubAllGlobals();
});

describe("mobile customer session isolation", () => {
  it("removes account data and screen drafts even when provider logout fails", async () => {
    await render();
    expect(auth.isReady && auth.isSignedIn).toBe(true);
    const previousClient = sessionClient;
    previousClient.setQueryData(["samra", "customer"], { id: "synthetic-a" });
    await previousClient
      .getMutationCache()
      .build(previousClient, {
        mutationFn: async () => ({ walletId: "synthetic-wallet-a" }),
      })
      .execute(undefined);
    await act(async () => changeDraft("synthetic-recipient-a"));
    mocks.signOut.mockRejectedValue(new Error("provider unavailable"));

    await act(async () => {
      await auth.signOut().catch(() => undefined);
    });

    expect(auth.isSignedIn).toBe(false);
    expect(sessionClient).not.toBe(previousClient);
    expect(previousClient.getQueryCache().getAll()).toHaveLength(0);
    expect(previousClient.getMutationCache().getAll()).toHaveLength(0);
    expect(host.querySelector("#draft")?.textContent).toBe("");
    expect(mocks.setToken).toHaveBeenLastCalledWith(null);
    await act(async () => auth.signIn());
    expect(auth.isSignedIn).toBe(true);
    expect(sessionClient.getQueryData(["samra", "customer"])).toBeUndefined();
  });

  it("keeps late query and mutation results out of the next account", async () => {
    await render();
    const previousClient = sessionClient;
    let finishQuery!: (value: unknown) => void;
    const pendingQuery = previousClient
      .fetchQuery({
        queryKey: ["samra", "accounts"],
        queryFn: () =>
          new Promise((resolve) => {
            finishQuery = resolve;
          }),
      })
      .catch(() => undefined);
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
    await act(async () => auth.signOut());
    await act(async () => auth.signIn());
    await act(async () => {
      finishQuery({ customerId: "synthetic-a" });
      finishMutation({ customerId: "synthetic-a" });
      await Promise.all([pendingQuery, pendingMutation]);
    });
    expect(sessionClient.getQueryCache().getAll()).toHaveLength(0);
    expect(sessionClient.getMutationCache().getAll()).toHaveLength(0);
    expect(auth.isSignedIn).toBe(true);
  });

  it.each(["resolved", "rejected"])(
    "rejects an obsolete %s token lookup without ending the next session",
    async (outcome) => {
      await render();
      const previousGetter = tokenGetter();
      let finish!: (value: string) => void;
      let fail!: (cause: Error) => void;
      mocks.token.mockImplementationOnce(
        () =>
          new Promise<string>((resolve, reject) => {
            finish = resolve;
            fail = reject;
          }),
      );
      const pending = previousGetter().then(
        () => "accepted",
        () => "rejected",
      );
      await act(async () => auth.signOut());
      await act(async () => auth.signIn());
      const currentGetter = tokenGetter();
      await act(async () => {
        if (outcome === "resolved") finish("synthetic-old-token");
        else fail(new Error("obsolete lookup failed"));
        expect(await pending).toBe("rejected");
      });
      expect(auth.isSignedIn).toBe(true);
      expect(tokenGetter()).toBe(currentGetter);
      await expect(currentGetter()).resolves.toBe("synthetic-token");
      const calls = mocks.token.mock.calls.length;
      await expect(previousGetter()).rejects.toThrow();
      expect(mocks.token).toHaveBeenCalledTimes(calls);
    },
  );

  it("removes cached account data when the current credentials fail", async () => {
    await render();
    sessionClient.setQueryData(["samra", "accounts"], [{ id: "synthetic-a" }]);
    const getter = tokenGetter();
    mocks.token.mockRejectedValue(
      new Error("provider credentials unavailable"),
    );
    await act(async () => {
      await expect(getter()).rejects.toThrow();
    });
    expect(auth.isSignedIn).toBe(false);
    expect(sessionClient.getQueryCache().getAll()).toHaveLength(0);
    expect(mocks.setToken).toHaveBeenLastCalledWith(null);
  });

  it("ignores an obsolete restore after configuration changes", async () => {
    let finishOldRestore!: (value: boolean) => void;
    mocks.restore.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finishOldRestore = resolve;
        }),
    );
    await render();
    await render({ ...CONFIG, clientId: "ReplacementCiClient_12345678" });
    const currentGetter = tokenGetter();
    const currentClient = sessionClient;
    await act(async () => finishOldRestore(false));
    expect(auth.isReady && auth.isSignedIn).toBe(true);
    expect(tokenGetter()).toBe(currentGetter);
    expect(sessionClient).toBe(currentClient);
  });
});
