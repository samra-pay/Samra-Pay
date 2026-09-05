import type { PublicLanguage } from "./public-i18n";

export const COMING_SOON_CONSENT_VERSION = "public-waitlist-2026-09-04";

type WaitlistReceipt = Readonly<{
  accepted: true;
  acceptedAt: string;
}>;

export async function subscribePublicWaitlist(
  input: Readonly<{
    email: string;
    firstName?: string;
    phoneNumber?: string;
    locale: PublicLanguage;
    website?: string;
    idempotencyKey?: string;
  }>,
): Promise<WaitlistReceipt> {
  const response = await fetch("/api/v1/waitlist/subscriptions", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey ?? globalThis.crypto.randomUUID(),
    },
    body: JSON.stringify({
      email: input.email,
      ...(input.firstName?.trim() ? { firstName: input.firstName.trim() } : {}),
      ...(input.phoneNumber?.trim()
        ? { phoneNumber: input.phoneNumber.trim() }
        : {}),
      consent: true,
      consentVersion: COMING_SOON_CONSENT_VERSION,
      locale: input.locale,
      website: input.website ?? "",
    }),
  });

  if (!response.ok) {
    throw new Error("WAITLIST_UNAVAILABLE");
  }
  const body: unknown = await response.json();
  if (
    !body ||
    typeof body !== "object" ||
    (body as Record<string, unknown>)["accepted"] !== true ||
    typeof (body as Record<string, unknown>)["acceptedAt"] !== "string"
  ) {
    throw new Error("WAITLIST_INVALID_RESPONSE");
  }
  return body as WaitlistReceipt;
}
