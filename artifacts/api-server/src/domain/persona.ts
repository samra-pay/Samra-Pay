import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { DomainError } from "@workspace/remittance";
import type {
  CustomerIdentityCaseStore,
  CustomerIdentityProviderDecision,
  CustomerIdentityProviderEventResult,
} from "@workspace/db";
import type { CustomerIdentityProviderConfig } from "../config";
import type { CustomerIdentityProvider } from "./customer-identity";

const PERSONA_API_ORIGIN = "https://api.withpersona.com";
const PERSONA_CREATE_INQUIRY_PATH = "/api/v1/inquiries";
const PERSONA_WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export class PersonaSandboxAdapter implements CustomerIdentityProvider {
  readonly provider = "persona" as const;
  readonly environment = "sandbox" as const;
  readonly clientEnvironmentId: string;
  readonly hostedFlowAvailable: boolean;
  readonly #hostedFlowOrigin: string | undefined;
  readonly #apiKey: string;
  readonly #inquiryTemplateId: string;
  readonly #apiVersion: string;
  readonly #fetch: FetchLike;

  constructor(
    config: Extract<
      CustomerIdentityProviderConfig,
      { mode: "persona-sandbox" }
    >,
    dependencies: Readonly<{ fetch?: FetchLike }> = {},
  ) {
    this.#apiKey = config.apiKey;
    this.#inquiryTemplateId = config.inquiryTemplateId;
    this.clientEnvironmentId = config.environmentId;
    this.#apiVersion = config.apiVersion;
    this.#hostedFlowOrigin = config.hostedFlowOrigin;
    this.hostedFlowAvailable = config.hostedFlowOrigin !== undefined;
    this.#fetch = dependencies.fetch ?? fetch;
  }

  async createInquiry(input: {
    identityCaseId: string;
    providerRequestKey: string;
  }): Promise<Readonly<{ providerInquiryRef: string }>> {
    assertIdentityCaseReference(input.identityCaseId);
    if (!/^[0-9a-f]{64}$/u.test(input.providerRequestKey)) {
      throw new Error("The Persona provider request key is invalid.");
    }

    const response = await this.#fetch(
      new URL(PERSONA_CREATE_INQUIRY_PATH, PERSONA_API_ORIGIN),
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.#apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": input.providerRequestKey,
          "Persona-Version": this.#apiVersion,
        },
        body: JSON.stringify({
          data: {
            attributes: {
              "inquiry-template-id": this.#inquiryTemplateId,
              "reference-id": input.identityCaseId,
            },
          },
        }),
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) {
      throw new Error("Persona sandbox inquiry creation failed.");
    }
    const body: unknown = await response.json();
    const providerInquiryRef = extractPersonaInquiryReference(body);
    return Object.freeze({ providerInquiryRef });
  }

  async createHostedLaunch(input: {
    identityCaseId: string;
    providerInquiryRef: string;
    providerRequestKey: string;
  }): Promise<Readonly<{ url: string }>> {
    assertIdentityCaseReference(input.identityCaseId);
    if (
      !this.#hostedFlowOrigin ||
      !/^inq_[A-Za-z0-9]{8,}$/u.test(input.providerInquiryRef) ||
      !/^[0-9a-f]{64}$/u.test(input.providerRequestKey)
    ) {
      throw new Error("Persona hosted verification is unavailable.");
    }
    const endpoint = new URL(
      `/api/v1/inquiries/${input.providerInquiryRef}/generate-one-time-link`,
      PERSONA_API_ORIGIN,
    );
    // Ask for only the binding and state; never request identity-document fields.
    endpoint.searchParams.set("fields[inquiry]", "reference-id,status");
    const response = await this.#fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.#apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.providerRequestKey,
        "Persona-Version": this.#apiVersion,
        "Key-Inflection": "kebab",
      },
      body: JSON.stringify({ meta: { "expires-in-seconds": 300 } }),
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (
      !response.ok ||
      response.headers.get("Persona-Environment-Id") !==
        this.clientEnvironmentId
    ) {
      throw new Error("Persona hosted verification is unavailable.");
    }
    const root = asRecord(await readBoundedLaunchResponse(response));
    const data = asRecord(root?.["data"]);
    const attributes = asRecord(data?.["attributes"]);
    const meta = asRecord(root?.["meta"]);
    if (
      data?.["type"] !== "inquiry" ||
      data["id"] !== input.providerInquiryRef ||
      attributes?.["reference-id"] !== input.identityCaseId ||
      !["created", "pending"].includes(String(attributes?.["status"]))
    ) {
      throw new Error("Persona hosted verification is unavailable.");
    }
    const value = meta?.["one-time-link"];
    if (typeof value !== "string" || value.length > 2048) {
      throw new Error("Persona hosted verification is unavailable.");
    }
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.origin !== this.#hostedFlowOrigin ||
      url.username ||
      url.password ||
      url.hash ||
      url.pathname !== "/verify" ||
      [...url.searchParams.keys()].join(",") !== "code" ||
      !/^[A-Za-z0-9_-]{8,512}$/u.test(url.searchParams.get("code") ?? "")
    ) {
      throw new Error("Persona hosted verification is unavailable.");
    }
    return Object.freeze({ url: url.href });
  }
}

async function readBoundedLaunchResponse(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Persona hosted verification is unavailable.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65_536) {
        await reader.cancel();
        throw new Error("Persona hosted verification is unavailable.");
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } finally {
    reader.releaseLock();
  }
}

export class PersonaWebhookAuthenticationError extends Error {
  constructor() {
    super("The provider webhook could not be authenticated.");
    this.name = "PersonaWebhookAuthenticationError";
  }
}

export type PersonaWebhookReceipt =
  | Readonly<{ ignored: true }>
  | Readonly<{
      ignored: false;
      result: CustomerIdentityProviderEventResult;
    }>;

export class PersonaWebhookService {
  readonly #store: CustomerIdentityCaseStore;
  readonly #webhookSecrets: readonly string[];
  readonly #clock: () => number;

  constructor(
    input: Readonly<{
      store: CustomerIdentityCaseStore;
      webhookSecrets: readonly string[];
      clock?: () => number;
    }>,
  ) {
    if (input.webhookSecrets.length < 1 || input.webhookSecrets.length > 2) {
      throw new Error(
        "Persona webhook verification requires one or two secrets.",
      );
    }
    this.#store = input.store;
    this.#webhookSecrets = Object.freeze([...input.webhookSecrets]);
    this.#clock = input.clock ?? Date.now;
  }

  async process(
    input: Readonly<{
      rawBody: Buffer;
      signatureHeader: string | undefined;
    }>,
  ): Promise<PersonaWebhookReceipt> {
    verifyPersonaWebhookSignature({
      rawBody: input.rawBody,
      signatureHeader: input.signatureHeader,
      webhookSecrets: this.#webhookSecrets,
      nowMilliseconds: this.#clock(),
    });
    const event = parsePersonaDecisionEvent(input.rawBody);
    if (!event) return Object.freeze({ ignored: true });
    const result = await this.#store.recordProviderEvent({
      identityCaseId: event.identityCaseId,
      providerInquiryRef: event.providerInquiryRef,
      providerEventRef: event.providerEventRef,
      eventType: event.eventType,
      decision: event.decision,
      payloadDigest: createHash("sha256").update(input.rawBody).digest("hex"),
    });
    return Object.freeze({ ignored: false, result });
  }
}

export function verifyPersonaWebhookSignature(
  input: Readonly<{
    rawBody: Buffer;
    signatureHeader: string | undefined;
    webhookSecrets: readonly string[];
    nowMilliseconds: number;
  }>,
): void {
  const header = input.signatureHeader;
  if (!header) throw new PersonaWebhookAuthenticationError();
  const timestampMatch = /(?:^|\s)t=(\d+)(?:,|\s|$)/u.exec(header);
  const signatureMatches = [
    ...header.matchAll(/(?:^|[,\s])v1=([0-9a-f]{64})(?=$|[,\s])/gu),
  ];
  if (!timestampMatch || signatureMatches.length === 0) {
    throw new PersonaWebhookAuthenticationError();
  }
  const timestamp = Number(timestampMatch[1]);
  if (!Number.isSafeInteger(timestamp)) {
    throw new PersonaWebhookAuthenticationError();
  }
  const nowSeconds = Math.floor(input.nowMilliseconds / 1_000);
  if (Math.abs(nowSeconds - timestamp) > PERSONA_WEBHOOK_TOLERANCE_SECONDS) {
    throw new PersonaWebhookAuthenticationError();
  }
  const signedPayload = Buffer.concat([
    Buffer.from(`${timestamp}.`, "utf8"),
    input.rawBody,
  ]);
  const receivedSignatures = signatureMatches.map((match) =>
    Buffer.from(match[1]!, "hex"),
  );
  const valid = input.webhookSecrets.some((secret) => {
    const expected = createHmac("sha256", secret)
      .update(signedPayload)
      .digest();
    return receivedSignatures.some(
      (received) =>
        received.length === expected.length &&
        timingSafeEqual(received, expected),
    );
  });
  if (!valid) throw new PersonaWebhookAuthenticationError();
}

type PersonaDecisionEvent = Readonly<{
  identityCaseId: string;
  providerInquiryRef: string;
  providerEventRef: string;
  eventType: string;
  decision: CustomerIdentityProviderDecision;
}>;

export function parsePersonaDecisionEvent(
  rawBody: Buffer,
): PersonaDecisionEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw invalidPersonaPayload();
  }
  const root = asRecord(parsed);
  const data = asRecord(root?.["data"]);
  const attributes = asRecord(data?.["attributes"]);
  const eventType = attributes?.["name"];
  if (typeof eventType !== "string") throw invalidPersonaPayload();

  const eventMap: Readonly<
    Record<
      string,
      Readonly<{
        status: string;
        decision: CustomerIdentityProviderDecision;
      }>
    >
  > = Object.freeze({
    "inquiry.marked-for-review": Object.freeze({
      status: "needs_review",
      decision: "review",
    }),
    "inquiry.approved": Object.freeze({
      status: "approved",
      decision: "approved",
    }),
    "inquiry.declined": Object.freeze({
      status: "declined",
      decision: "declined",
    }),
  });
  const mapping = eventMap[eventType];
  if (!mapping) return null;

  const providerEventRef = data?.["id"];
  const payload = asRecord(attributes?.["payload"]);
  const inquiry = asRecord(payload?.["data"]);
  const inquiryAttributes = asRecord(inquiry?.["attributes"]);
  const providerInquiryRef = inquiry?.["id"];
  const identityCaseId = inquiryAttributes?.["reference-id"];
  const status = inquiryAttributes?.["status"];
  if (
    data?.["type"] !== "event" ||
    typeof providerEventRef !== "string" ||
    !/^evt_[A-Za-z0-9]{8,}$/u.test(providerEventRef) ||
    inquiry?.["type"] !== "inquiry" ||
    typeof providerInquiryRef !== "string" ||
    !/^inq_[A-Za-z0-9]{8,}$/u.test(providerInquiryRef) ||
    typeof identityCaseId !== "string" ||
    status !== mapping.status
  ) {
    throw invalidPersonaPayload();
  }
  assertIdentityCaseReference(identityCaseId);
  return Object.freeze({
    identityCaseId,
    providerInquiryRef,
    providerEventRef,
    eventType,
    decision: mapping.decision,
  });
}

function extractPersonaInquiryReference(value: unknown): string {
  const data = asRecord(asRecord(value)?.["data"]);
  const id = data?.["id"];
  if (
    data?.["type"] !== "inquiry" ||
    typeof id !== "string" ||
    !/^inq_[A-Za-z0-9]{8,}$/u.test(id)
  ) {
    throw new Error("Persona sandbox returned an invalid inquiry response.");
  }
  return id;
}

function assertIdentityCaseReference(value: string): void {
  if (!/^identity_case_[0-9a-f]{32}$/u.test(value)) {
    throw new DomainError(
      "INVALID_ARGUMENT",
      "The provider event does not reference a valid Samra identity case.",
    );
  }
}

function invalidPersonaPayload(): DomainError {
  return new DomainError(
    "INVALID_ARGUMENT",
    "The provider webhook payload is not a supported Persona decision event.",
  );
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
