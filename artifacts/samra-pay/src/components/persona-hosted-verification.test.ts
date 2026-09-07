import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SyntheticSamraOnboardingSource } from "@workspace/samra-client/onboarding";
import { PersonaHostedVerification } from "./persona-hosted-verification";

const launch = {
  provider: "persona",
  environment: "sandbox",
  url: "https://inquiry.withpersona.com/verify?code=SYNTHETICHOSTEDLINK123",
} as const;
let root: Root;
let host: HTMLDivElement;
const createLaunch = vi.fn();
const onReturn = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function render() {
  const source = Object.assign(new SyntheticSamraOnboardingSource(), {
    createIdentityHostedLaunch: createLaunch,
  });
  await act(async () =>
    root.render(createElement(PersonaHostedVerification, { source, onReturn })),
  );
}
async function prepare() {
  await act(async () =>
    host.querySelector<HTMLButtonElement>("button")!.click(),
  );
}

it("prepares one launch per explicit action, opens safely, and refreshes canonical state on return", async () => {
  let resolve!: (value: typeof launch) => void;
  createLaunch.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  await render();
  await prepare();
  expect(host.querySelector("button")?.disabled).toBe(true);
  await prepare();
  expect(createLaunch).toHaveBeenCalledTimes(1);
  expect(createLaunch.mock.calls[0][0]).toMatch(/^[0-9a-f-]{36}$/);
  await act(async () => resolve(launch));
  const link = host.querySelector("a")!;
  expect(link.href).toBe(launch.url);
  expect(link.target).toBe("_blank");
  expect(link.rel).toBe("noopener noreferrer");
  expect(link.getAttribute("referrerpolicy")).toBe("no-referrer");
  expect(host.textContent).toContain("test information only");
  expect(onReturn).not.toHaveBeenCalled();
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(onReturn).toHaveBeenCalledTimes(1);
  expect(host.querySelector("a")).toBeNull();
  createLaunch.mockResolvedValue(launch);
  await prepare();
  expect(createLaunch.mock.calls[1][0]).not.toBe(createLaunch.mock.calls[0][0]);
});

it("discards stale links and reports provider failures without leaking their details", async () => {
  vi.useFakeTimers();
  createLaunch
    .mockResolvedValueOnce(launch)
    .mockRejectedValueOnce(new Error("private-provider-payload"));
  await render();
  await prepare();
  expect(host.querySelector("a")).not.toBeNull();
  await act(async () => vi.advanceTimersByTime(4 * 60_000));
  expect(host.querySelector("a")).toBeNull();
  await prepare();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "saved progress is unchanged",
  );
  expect(host.textContent).not.toContain("private-provider-payload");
  expect(host.querySelector("button")?.disabled).toBe(false);
  expect(onReturn).not.toHaveBeenCalled();
});

it("discards the browser copy after following the link", async () => {
  vi.useFakeTimers();
  createLaunch.mockResolvedValue(launch);
  await render();
  await prepare();
  const link = host.querySelector("a")!;
  link.addEventListener("click", (event) => event.preventDefault());
  await act(async () => link.click());
  await act(async () => vi.advanceTimersByTime(1));
  expect(host.querySelector("a")).toBeNull();
  expect(onReturn).not.toHaveBeenCalled();
});
