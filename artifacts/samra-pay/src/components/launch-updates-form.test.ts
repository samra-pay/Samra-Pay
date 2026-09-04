import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PublicLanguageProvider } from "../lib/public-i18n";
import {
  isLocalUpdatesPreview,
  LaunchUpdatesForm,
} from "./launch-updates-form";

let root: Root;
let host: HTMLDivElement;
const fetchSpy = vi.fn();
const email = () =>
  host.querySelector<HTMLInputElement>('input[type="email"]')!;
const consent = () =>
  host.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
async function render() {
  await act(async () =>
    root.render(
      createElement(
        PublicLanguageProvider,
        null,
        createElement(LaunchUpdatesForm),
      ),
    ),
  );
}
async function enterEmail(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(email(), value);
    email().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() {
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetchSpy);
  vi.spyOn(window, "location", "get").mockReturnValue(
    new URL("http://127.0.0.1:4179/") as unknown as Location,
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("launch updates preview", () => {
  it.each(["localhost", "127.0.0.1", "[::1]"])(
    "allows only loopback review: %s",
    (hostname) => {
      expect(isLocalUpdatesPreview(hostname)).toBe(true);
    },
  );
  it.each([
    "www.samrapay.com",
    "samrapay.com",
    "samra-preview.web.app",
    "localhost.example",
    "127.0.0.1.example",
    "",
  ])("does not collect on %s", (hostname) => {
    expect(isLocalUpdatesPreview(hostname)).toBe(false);
  });
  it("starts with empty email, unchecked consent, visible labels and privacy link", async () => {
    await render();
    expect(email().value).toBe("");
    expect(consent().checked).toBe(false);
    expect(host.querySelector(`label[for="${email().id}"]`)?.textContent).toBe(
      "Email address",
    );
    expect(host.querySelector('a[href="/privacy"]')).not.toBeNull();
    expect(host.textContent).toContain("Local test only");
  });
  it.each([
    "",
    "invalid",
    "a@example",
    "a b@example.com",
    "a".repeat(250) + "@example.com",
  ])("rejects invalid input: %s", async (value) => {
    await render();
    await enterEmail(value);
    await submit();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      "Enter a valid email.",
    );
    expect(email().getAttribute("aria-invalid")).toBe("true");
    expect(
      document.getElementById(email().getAttribute("aria-describedby")!),
    ).not.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("requires email consent independently of saved analytics permission", async () => {
    localStorage.setItem("samra-public-analytics-consent-v1", "granted");
    await render();
    await enterEmail("reader@example.com");
    await submit();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      "Email consent is required.",
    );
    expect(consent().getAttribute("aria-invalid")).toBe("true");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("simulates the flow without a false subscription, transmission, or persistence", async () => {
    const localWrites = vi.spyOn(localStorage, "setItem");
    const sessionWrites = vi.spyOn(sessionStorage, "setItem");
    await render();
    await enterEmail("reader@example.com");
    await act(async () => consent().click());
    await submit();
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      "Test complete. No subscription created.",
    );
    expect(host.textContent).not.toContain("reader@example.com");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(localWrites).not.toHaveBeenCalled();
    expect(sessionWrites).not.toHaveBeenCalled();
    await act(async () => host.querySelector("button")!.click());
    expect(email().value).toBe("");
    expect(consent().checked).toBe(false);
  });
  it("fails closed on public hosts even if a submit event is dispatched", async () => {
    vi.spyOn(window, "location", "get").mockReturnValue(
      new URL("https://www.samrapay.com/") as unknown as Location,
    );
    await render();
    expect(email().disabled).toBe(true);
    expect(consent().disabled).toBe(true);
    expect(
      host.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled,
    ).toBe(true);
    await submit();
    expect(host.textContent).toContain("Email sign-up opens shortly.");
    expect(host.textContent).not.toContain("Test complete");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("localizes labels, consent, validation and test status in Amharic", async () => {
    localStorage.setItem("samra-language", "am");
    await render();
    expect(host.querySelector("h2")?.textContent).toBe("ዜና ይከታተሉ");
    await submit();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      "ትክክለኛ ኢሜይል ያስገቡ።",
    );
    await enterEmail("reader@example.com");
    await act(async () => consent().click());
    await submit();
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      "ምዝገባ አልተፈጠረም።",
    );
  });
});
