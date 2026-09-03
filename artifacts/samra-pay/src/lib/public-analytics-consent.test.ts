import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PublicLanguageProvider } from "./public-i18n";
import { PublicAnalyticsConsent } from "../components/public-analytics-consent";

const mocks = vi.hoisted(() => ({
  read: vi.fn<() => "granted" | "denied" | null>(() => null),
  store: vi.fn(() => true),
  start: vi.fn(() => true),
  stop: vi.fn(() => false),
  signal: vi.fn(() => false),
  reload: vi.fn(() => false),
}));
vi.mock("./public-analytics", () => ({
  CONSENT_KEY: "samra-public-analytics-consent-v1",
  PREFERENCES_EVENT: "samra-analytics-preferences",
  readAnalyticsChoice: mocks.read,
  storeAnalyticsChoice: mocks.store,
  startPublicAnalytics: mocks.start,
  stopPublicAnalytics: mocks.stop,
  privacySignalEnabled: mocks.signal,
  analyticsNeedsReload: mocks.reload,
}));

let root: Root;
let host: HTMLDivElement;
const button = (label: string) =>
  Array.from(host.querySelectorAll("button")).find(
    (item) => item.textContent === label,
  )!;
async function render(showPrompt = true) {
  await act(async () =>
    root.render(
      createElement(
        PublicLanguageProvider,
        null,
        createElement(PublicAnalyticsConsent, { showPrompt }),
      ),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockReturnValue(null);
  mocks.store.mockReturnValue(true);
  mocks.signal.mockReturnValue(false);
  mocks.reload.mockReturnValue(false);
  localStorage.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("analytics consent controls", () => {
  it("starts off, explains the choice, and offers equal explicit actions", async () => {
    await render();
    expect(mocks.start).not.toHaveBeenCalled();
    expect(host.querySelector("section")?.getAttribute("aria-labelledby")).toBe(
      "analytics-title",
    );
    expect(button("Accept analytics").disabled).toBe(false);
    expect(button("Reject analytics")).toBeDefined();
    expect(host.querySelector("a")?.getAttribute("href")).toBe("/privacy");
    expect(document.activeElement).not.toBe(host.querySelector("h2"));
  });

  it("persists rejection and leaves the website usable", async () => {
    await render();
    await act(async () => button("Reject analytics").click());
    expect(mocks.store).toHaveBeenCalledWith("denied");
    expect(mocks.start).not.toHaveBeenCalled();
    expect(host.querySelector("section")).toBeNull();
  });

  it("starts collection only after successfully saving acceptance", async () => {
    await render();
    await act(async () => button("Accept analytics").click());
    expect(mocks.store).toHaveBeenCalledWith("granted");
    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(host.querySelector("section")).toBeNull();
  });

  it("does not collect when saving acceptance fails", async () => {
    mocks.store.mockReturnValue(false);
    await render();
    await act(async () => button("Accept analytics").click());
    expect(mocks.start).not.toHaveBeenCalled();
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      "could not be saved",
    );
  });

  it("reopens from the footer and withdraws a saved grant", async () => {
    mocks.read.mockReturnValue("granted");
    await render();
    expect(host.querySelector("section")).toBeNull();
    await act(async () =>
      window.dispatchEvent(new Event("samra-analytics-preferences")),
    );
    expect(host.querySelector("section")).not.toBeNull();
    await act(async () => button("Reject analytics").click());
    expect(mocks.store).toHaveBeenCalledWith("denied");
    expect(mocks.stop).toHaveBeenCalled();
  });

  it("responds to consent withdrawal in another tab", async () => {
    mocks.read.mockReturnValue("granted");
    await render();
    mocks.read.mockReturnValue("denied");
    await act(async () =>
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "samra-public-analytics-consent-v1",
        }),
      ),
    );
    expect(mocks.stop).toHaveBeenCalledTimes(1);
  });

  it("explains and enforces browser privacy signals", async () => {
    mocks.read.mockReturnValue("denied");
    mocks.signal.mockReturnValue(true);
    await render();
    await act(async () =>
      window.dispatchEvent(new Event("samra-analytics-preferences")),
    );
    expect(button("Accept analytics").disabled).toBe(true);
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      "keeps analytics off",
    );
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("renders both choices in Amharic", async () => {
    localStorage.setItem("samra-language", "am");
    await render();
    expect(host.querySelector("section")?.lang).toBe("am");
    expect(button("ትንታኔን ፍቀድ")).toBeDefined();
    expect(button("ትንታኔን አትፍቀድ")).toBeDefined();
  });

  it("does not prompt on unknown routes but keeps preferences accessible", async () => {
    await render(false);
    expect(host.querySelector("section")).toBeNull();
    await act(async () =>
      window.dispatchEvent(new Event("samra-analytics-preferences")),
    );
    expect(host.querySelector("section")).not.toBeNull();
  });
});
