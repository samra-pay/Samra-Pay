import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PublicLanguageProvider } from "../lib/public-i18n";
import { LaunchUpdatesForm } from "./launch-updates-form";

let root: Root;
let host: HTMLDivElement;
const fetchSpy = vi.fn();
const email = () =>
  host.querySelector<HTMLInputElement>('input[type="email"]')!;
const consent = () =>
  host.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
const honeypot = () =>
  host.querySelector<HTMLInputElement>('input[name="website"]')!;

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

async function enter(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
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
  vi.stubGlobal("crypto", { randomUUID: () => "waitlist-browser-test-001" });
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

describe("launch updates waitlist", () => {
  it("starts enabled with empty fields, explicit consent and a privacy link", async () => {
    await render();
    expect(email().disabled).toBe(false);
    expect(email().value).toBe("");
    expect(consent().checked).toBe(false);
    expect(host.querySelector(`label[for="${email().id}"]`)?.textContent).toBe(
      "Email address",
    );
    expect(host.querySelector('a[href="/privacy"]')).not.toBeNull();
    expect(honeypot().tabIndex).toBe(-1);
  });

  it.each([
    "",
    "invalid",
    "a@example",
    "a b@example.com",
    "a".repeat(250) + "@example.com",
  ])("rejects invalid input without a request: %s", async (value) => {
    await render();
    await enter(email(), value);
    await submit();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      "Enter a valid email.",
    );
    expect(email().getAttribute("aria-invalid")).toBe("true");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("requires email consent independently of analytics permission", async () => {
    localStorage.setItem("samra-public-analytics-consent-v1", "granted");
    await render();
    await enter(email(), "reader@example.com");
    await submit();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      "Email consent is required.",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("submits the bounded waitlist request and clears the address", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          accepted: true,
          acceptedAt: "2026-09-04T20:00:00.000Z",
        }),
        { status: 202, headers: { "Content-Type": "application/json" } },
      ),
    );
    await render();
    await enter(email(), "reader@example.com");
    await act(async () => consent().click());
    await submit();

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [, init] = fetchSpy.mock.calls[0]!;
    expect(JSON.parse(String(init.body))).toEqual({
      email: "reader@example.com",
      consent: true,
      consentVersion: "public-waitlist-2026-09-04",
      locale: "en",
      website: "",
    });
    expect(host.textContent).toContain(
      "You're on the pre-launch list. We'll keep you informed.",
    );
    expect(host.textContent).not.toContain("reader@example.com");
  });

  it("passes the hidden bot field and shows a truthful service error", async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 503 }));
    await render();
    await enter(email(), "reader@example.com");
    await enter(honeypot(), "https://bot.example");
    await act(async () => consent().click());
    await submit();

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [, init] = fetchSpy.mock.calls[0]!;
    expect(JSON.parse(String(init.body)).website).toBe("https://bot.example");
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      "We couldn't save your email. Please try again.",
    );
    expect(email().value).toBe("reader@example.com");
  });

  it("localizes the accepted state in Amharic", async () => {
    localStorage.setItem("samra-language", "am");
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          accepted: true,
          acceptedAt: "2026-09-04T20:00:00.000Z",
        }),
        { status: 202, headers: { "Content-Type": "application/json" } },
      ),
    );
    await render();
    await enter(email(), "reader@example.com");
    await act(async () => consent().click());
    await submit();
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      "በቅድመ ማስጀመሪያ ዝርዝሩ ውስጥ ገብተዋል።",
    );
  });
});

it("submits an optional name and normalized phone and clears them after success", async () => {
  fetchSpy.mockResolvedValueOnce(
    Response.json(
      { accepted: true, acceptedAt: "2026-09-05T12:00:00Z" },
      { status: 202 },
    ),
  );
  await render();
  const name = host.querySelector<HTMLInputElement>('input[name="firstName"]')!;
  const phone = host.querySelector<HTMLInputElement>('input[type="tel"]')!;
  expect(name.required).toBe(false);
  expect(phone.required).toBe(false);
  expect(host.querySelector(`label[for="${phone.id}"]`)).not.toBeNull();
  await enter(name, "  David  ");
  await enter(phone, "(202) 555-0123");
  await enter(email(), "reader@example.com");
  await act(async () => consent().click());
  await submit();
  await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
  expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).toMatchObject({
    firstName: "David",
    phoneNumber: "+12025550123",
  });
  await act(async () =>
    host.querySelector<HTMLButtonElement>('button[type="button"]')!.click(),
  );
  expect(
    host.querySelector<HTMLInputElement>('input[name="firstName"]')!.value,
  ).toBe("");
  expect(host.querySelector<HTMLInputElement>('input[type="tel"]')!.value).toBe(
    "",
  );
});

it("rejects malformed phone without submitting and keeps entered values on failure", async () => {
  await render();
  const phone = host.querySelector<HTMLInputElement>('input[type="tel"]')!;
  await enter(email(), "reader@example.com");
  await enter(phone, "123");
  await act(async () => consent().click());
  await submit();
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(phone.getAttribute("aria-invalid")).toBe("true");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "country code",
  );
  fetchSpy.mockResolvedValueOnce(new Response(null, { status: 503 }));
  await enter(phone, "2025550123");
  await submit();
  await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
  expect(phone.value).toBe("2025550123");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "try again",
  );
});
