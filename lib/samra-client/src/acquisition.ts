export const CUSTOMER_ACQUISITION_EVENT_TYPES = Object.freeze([
  "landing_view",
  "app_open",
  "quote_started",
  "quote_completed",
  "signup_started",
] as const);

export const CUSTOMER_ACQUISITION_CHANNELS = Object.freeze([
  "direct",
  "organic_search",
  "organic_social",
  "paid_search",
  "paid_social",
  "referral",
  "email",
  "partner",
  "offline",
  "unknown",
] as const);

export type CustomerAcquisitionEventType =
  (typeof CUSTOMER_ACQUISITION_EVENT_TYPES)[number];
export type CustomerAcquisitionChannel =
  (typeof CUSTOMER_ACQUISITION_CHANNELS)[number];
export type CustomerAcquisitionPlatform = "web" | "mobile";

export type CustomerAcquisitionAttribution = Readonly<{
  channel: CustomerAcquisitionChannel;
  source: string | null;
  medium: string | null;
  campaign: string | null;
}>;

export type CustomerAcquisitionReceipt = Readonly<{
  sessionId: string;
  eventType: CustomerAcquisitionEventType;
  recorded: boolean;
  recordedAt: string;
}>;

export interface CustomerAcquisitionTransport {
  recordEvent(
    input: Readonly<{
      sessionId?: string;
      eventType: CustomerAcquisitionEventType;
      platform: CustomerAcquisitionPlatform;
      attribution: CustomerAcquisitionAttribution;
    }>,
    idempotencyKey: string,
  ): Promise<CustomerAcquisitionReceipt>;
  bindSession(
    input: Readonly<{ sessionId?: string }>,
    idempotencyKey: string,
  ): Promise<void>;
}

export interface CustomerAcquisitionSessionStore {
  get(): Promise<string | null>;
  set(sessionId: string): Promise<void>;
}

export type CustomerAcquisitionOperation =
  "load_session" | "save_session" | "record_event" | "bind_session";

export type CustomerAcquisitionFailure = Readonly<{
  operation: CustomerAcquisitionOperation;
  error: unknown;
}>;

export type CustomerAcquisitionResult =
  | Readonly<{ status: "recorded"; sessionId: string }>
  | Readonly<{ status: "bound"; sessionId: string | null }>
  | Readonly<{ status: "skipped" }>
  | Readonly<{ status: "failed" }>;

export interface CustomerAcquisitionClient {
  readonly enabled: boolean;
  recordOnce(
    eventType: CustomerAcquisitionEventType,
  ): Promise<CustomerAcquisitionResult>;
  bind(): Promise<CustomerAcquisitionResult>;
}

type CustomerAcquisitionTrackerOptions = Readonly<{
  platform: CustomerAcquisitionPlatform;
  attribution: CustomerAcquisitionAttribution;
  transport: CustomerAcquisitionTransport;
  sessionStore?: CustomerAcquisitionSessionStore;
  allowCookieSession?: boolean;
  createIdempotencyKey?: () => string;
  onFailure?: (failure: CustomerAcquisitionFailure) => void;
}>;

const SESSION_PATTERN = /^acq_[0-9a-f]{32}$/;
const DIMENSION_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const MAXIMUM_CAMPAIGN_ALLOWLIST_SIZE = 50;

export class CustomerAcquisitionTracker implements CustomerAcquisitionClient {
  readonly enabled = true;
  readonly #platform: CustomerAcquisitionPlatform;
  readonly #attribution: CustomerAcquisitionAttribution;
  readonly #transport: CustomerAcquisitionTransport;
  readonly #sessionStore?: CustomerAcquisitionSessionStore;
  readonly #allowCookieSession: boolean;
  readonly #createIdempotencyKey: () => string;
  readonly #onFailure?: (failure: CustomerAcquisitionFailure) => void;
  readonly #eventKeys = new Map<CustomerAcquisitionEventType, string>();
  readonly #completedEvents = new Set<CustomerAcquisitionEventType>();
  readonly #eventRequests = new Map<
    CustomerAcquisitionEventType,
    Promise<CustomerAcquisitionResult>
  >();
  #sessionId: string | null = null;
  #initialization: Promise<void> | null = null;
  #bindKey: string | null = null;
  #bindRequest: Promise<CustomerAcquisitionResult> | null = null;
  #bound = false;

  constructor(options: CustomerAcquisitionTrackerOptions) {
    this.#platform = options.platform;
    this.#attribution = normalizeAttribution(options.attribution);
    this.#transport = options.transport;
    this.#sessionStore = options.sessionStore;
    this.#allowCookieSession = options.allowCookieSession ?? false;
    this.#createIdempotencyKey =
      options.createIdempotencyKey ?? createClientIdempotencyKey;
    this.#onFailure = options.onFailure;
  }

  async recordOnce(
    eventType: CustomerAcquisitionEventType,
  ): Promise<CustomerAcquisitionResult> {
    if (!CUSTOMER_ACQUISITION_EVENT_TYPES.includes(eventType)) {
      return Object.freeze({ status: "failed" as const });
    }
    if (this.#completedEvents.has(eventType)) {
      return Object.freeze({ status: "skipped" as const });
    }
    const active = this.#eventRequests.get(eventType);
    if (active) return active;

    const request = this.#record(eventType);
    this.#eventRequests.set(eventType, request);
    try {
      return await request;
    } finally {
      if (this.#eventRequests.get(eventType) === request) {
        this.#eventRequests.delete(eventType);
      }
    }
  }

  async bind(): Promise<CustomerAcquisitionResult> {
    if (this.#bound) {
      return Object.freeze({ status: "skipped" as const });
    }
    if (this.#bindRequest) return this.#bindRequest;

    const request = this.#bind();
    this.#bindRequest = request;
    try {
      return await request;
    } finally {
      if (this.#bindRequest === request) this.#bindRequest = null;
    }
  }

  async #record(
    eventType: CustomerAcquisitionEventType,
  ): Promise<CustomerAcquisitionResult> {
    await this.#initialize();
    const idempotencyKey =
      this.#eventKeys.get(eventType) ??
      `acquisition-${eventType}-${this.#createIdempotencyKey()}`;
    this.#eventKeys.set(eventType, idempotencyKey);

    try {
      const receipt = await this.#transport.recordEvent(
        {
          ...(this.#sessionId ? { sessionId: this.#sessionId } : {}),
          eventType,
          platform: this.#platform,
          attribution: this.#attribution,
        },
        idempotencyKey,
      );
      if (!SESSION_PATTERN.test(receipt.sessionId)) {
        throw new Error("The acquisition service returned an invalid session.");
      }
      if (receipt.eventType !== eventType) {
        throw new Error(
          "The acquisition service returned the wrong event type.",
        );
      }
      if (this.#sessionId && receipt.sessionId !== this.#sessionId) {
        throw new Error("The acquisition service changed the active session.");
      }
      this.#sessionId = receipt.sessionId;
      this.#completedEvents.add(eventType);
      await this.#saveSession(receipt.sessionId);
      return Object.freeze({
        status: "recorded" as const,
        sessionId: receipt.sessionId,
      });
    } catch (error) {
      this.#reportFailure("record_event", error);
      return Object.freeze({ status: "failed" as const });
    }
  }

  async #bind(): Promise<CustomerAcquisitionResult> {
    await this.#initialize();
    await Promise.allSettled([...this.#eventRequests.values()]);
    if (!this.#sessionId && !this.#allowCookieSession) {
      return Object.freeze({ status: "skipped" as const });
    }
    this.#bindKey ??= `acquisition-bind-${this.#createIdempotencyKey()}`;

    try {
      await this.#transport.bindSession(
        this.#sessionId ? { sessionId: this.#sessionId } : {},
        this.#bindKey,
      );
      this.#bound = true;
      return Object.freeze({
        status: "bound" as const,
        sessionId: this.#sessionId,
      });
    } catch (error) {
      this.#reportFailure("bind_session", error);
      return Object.freeze({ status: "failed" as const });
    }
  }

  async #initialize(): Promise<void> {
    if (!this.#initialization) {
      this.#initialization = (async () => {
        if (!this.#sessionStore) return;
        try {
          const stored = await this.#sessionStore.get();
          if (stored && SESSION_PATTERN.test(stored)) this.#sessionId = stored;
        } catch (error) {
          this.#reportFailure("load_session", error);
        }
      })();
    }
    await this.#initialization;
  }

  async #saveSession(sessionId: string): Promise<void> {
    if (!this.#sessionStore) return;
    try {
      await this.#sessionStore.set(sessionId);
    } catch (error) {
      this.#reportFailure("save_session", error);
    }
  }

  #reportFailure(
    operation: CustomerAcquisitionOperation,
    error: unknown,
  ): void {
    try {
      this.#onFailure?.(Object.freeze({ operation, error }));
    } catch {
      // Telemetry and its observer are never allowed to block customer work.
    }
  }
}

const SKIPPED_RESULT = Object.freeze({ status: "skipped" as const });

export const DISABLED_CUSTOMER_ACQUISITION_CLIENT: CustomerAcquisitionClient =
  Object.freeze({
    enabled: false,
    async recordOnce() {
      return SKIPPED_RESULT;
    },
    async bind() {
      return SKIPPED_RESULT;
    },
  });

const MEDIUMS: Readonly<
  Record<
    string,
    Readonly<{ channel: CustomerAcquisitionChannel; medium: string }>
  >
> = Object.freeze({
  cpc: { channel: "paid_search", medium: "cpc" },
  ppc: { channel: "paid_search", medium: "ppc" },
  paid_search: { channel: "paid_search", medium: "paid_search" },
  paid_social: { channel: "paid_social", medium: "paid_social" },
  social_paid: { channel: "paid_social", medium: "paid_social" },
  organic: { channel: "organic_search", medium: "organic" },
  organic_search: { channel: "organic_search", medium: "organic_search" },
  social: { channel: "organic_social", medium: "social" },
  organic_social: { channel: "organic_social", medium: "organic_social" },
  referral: { channel: "referral", medium: "referral" },
  email: { channel: "email", medium: "email" },
  partner: { channel: "partner", medium: "partner" },
  affiliate: { channel: "partner", medium: "affiliate" },
  offline: { channel: "offline", medium: "offline" },
  qr: { channel: "offline", medium: "qr" },
});

const SOURCE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  google: "google",
  bing: "bing",
  yahoo: "yahoo",
  duckduckgo: "duckduckgo",
  facebook: "facebook",
  fb: "facebook",
  instagram: "instagram",
  ig: "instagram",
  linkedin: "linkedin",
  tiktok: "tiktok",
  youtube: "youtube",
  reddit: "reddit",
  twitter: "x",
  x: "x",
  newsletter: "newsletter",
  community: "community",
  partner: "partner",
});

const SEARCH_HOSTS: Readonly<Record<string, string>> = Object.freeze({
  "google.com": "google",
  "www.google.com": "google",
  "bing.com": "bing",
  "www.bing.com": "bing",
  "search.yahoo.com": "yahoo",
  "duckduckgo.com": "duckduckgo",
});

const SOCIAL_HOSTS: Readonly<Record<string, string>> = Object.freeze({
  "facebook.com": "facebook",
  "www.facebook.com": "facebook",
  "instagram.com": "instagram",
  "www.instagram.com": "instagram",
  "linkedin.com": "linkedin",
  "www.linkedin.com": "linkedin",
  "tiktok.com": "tiktok",
  "www.tiktok.com": "tiktok",
  "youtube.com": "youtube",
  "www.youtube.com": "youtube",
  "reddit.com": "reddit",
  "www.reddit.com": "reddit",
  "x.com": "x",
  "twitter.com": "x",
});

export function directCustomerAcquisitionAttribution(): CustomerAcquisitionAttribution {
  return Object.freeze({
    channel: "direct",
    source: null,
    medium: null,
    campaign: null,
  });
}

export function parseCustomerAcquisitionCampaignAllowlist(
  value: unknown,
): readonly string[] {
  if (typeof value !== "string" || value.trim() === "") {
    return Object.freeze([]);
  }
  const campaigns = value.split(",").map((campaign) => campaign.trim());
  if (
    campaigns.length > MAXIMUM_CAMPAIGN_ALLOWLIST_SIZE ||
    new Set(campaigns).size !== campaigns.length ||
    campaigns.some((campaign) => !DIMENSION_PATTERN.test(campaign))
  ) {
    return Object.freeze([]);
  }
  return Object.freeze(campaigns);
}

export function deriveWebCustomerAcquisitionAttribution(
  input: Readonly<{
    search: string;
    referrer?: string;
    currentOrigin: string;
    allowedCampaigns?: readonly string[];
  }>,
): CustomerAcquisitionAttribution {
  const params = new URLSearchParams(
    input.search.startsWith("?") ? input.search.slice(1) : input.search,
  );
  const medium = MEDIUMS[params.get("utm_medium")?.trim().toLowerCase() ?? ""];
  const source =
    SOURCE_ALIASES[params.get("utm_source")?.trim().toLowerCase() ?? ""];
  const allowedCampaigns = new Set(
    (input.allowedCampaigns ?? []).filter((value) =>
      DIMENSION_PATTERN.test(value),
    ),
  );
  const requestedCampaign = params.get("utm_campaign")?.trim().toLowerCase();
  const campaign =
    requestedCampaign && allowedCampaigns.has(requestedCampaign)
      ? requestedCampaign
      : null;

  if (medium) {
    return freezeAttribution({
      channel: medium.channel,
      source: source ?? null,
      medium: medium.medium,
      campaign,
    });
  }
  if (params.has("gclid")) {
    return freezeAttribution({
      channel: "paid_search",
      source: "google",
      medium: "cpc",
      campaign,
    });
  }
  if (params.has("fbclid")) {
    return freezeAttribution({
      channel: "paid_social",
      source: source ?? "facebook",
      medium: "paid_social",
      campaign,
    });
  }

  const referrer = parseUrl(input.referrer);
  const currentOrigin = parseUrl(input.currentOrigin)?.origin;
  if (!referrer || referrer.origin === currentOrigin) {
    return directCustomerAcquisitionAttribution();
  }
  const searchSource = SEARCH_HOSTS[referrer.hostname.toLowerCase()];
  if (searchSource) {
    return freezeAttribution({
      channel: "organic_search",
      source: searchSource,
      medium: "organic",
      campaign: null,
    });
  }
  const socialSource = SOCIAL_HOSTS[referrer.hostname.toLowerCase()];
  if (socialSource) {
    return freezeAttribution({
      channel: "organic_social",
      source: socialSource,
      medium: "social",
      campaign: null,
    });
  }
  return freezeAttribution({
    channel: "referral",
    source: null,
    medium: "referral",
    campaign: null,
  });
}

function normalizeAttribution(
  attribution: CustomerAcquisitionAttribution,
): CustomerAcquisitionAttribution {
  const channel = CUSTOMER_ACQUISITION_CHANNELS.includes(attribution.channel)
    ? attribution.channel
    : "unknown";
  return freezeAttribution({
    channel,
    source: normalizeDimension(attribution.source),
    medium: normalizeDimension(attribution.medium),
    campaign: normalizeDimension(attribution.campaign),
  });
}

function normalizeDimension(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return DIMENSION_PATTERN.test(normalized) ? normalized : null;
}

function freezeAttribution(
  attribution: CustomerAcquisitionAttribution,
): CustomerAcquisitionAttribution {
  return Object.freeze({ ...attribution });
}

function parseUrl(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function createClientIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
