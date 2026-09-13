import { createResendContactAdapter } from "./resend-contact-sync.mjs";
import { createResendWaitlistTransport } from "./waitlist-resend.mjs";
import { createGoogleMarketingToken } from "./google-marketing-token.mjs";
import {
  createVerifiedLeadHandler,
  sendNextLeadVerification,
} from "./verified-lead-service.mjs";
import { createPreferenceTokens } from "./preference-tokens.mjs";
import {
  createPreferenceHandler,
  preferencePage,
} from "./marketing-preferences.mjs";
import { createMarketingWebhook } from "./marketing-webhook.mjs";
import { createResendTransport } from "./resend.mjs";
import {
  createGoogleAudienceAdapter,
  createMetaAudienceAdapter,
} from "./audience-providers.mjs";
import { json } from "./marketing-http.mjs";
const origin = "https://www.samrapay.com";
export function createMarketingApplication({
  leads,
  activation,
  preferenceTokens,
  webhookSecret,
  emailTransport,
  audienceAdapters = {},
}) {
  const preferences = createPreferenceHandler({
    tokens: preferenceTokens,
    leads,
  });
  const webhook = createMarketingWebhook({
    secret: webhookSecret,
    store: activation,
  });
  const verified = createVerifiedLeadHandler({
    store: leads,
    allowRequest: (request) =>
      activation.allowRequest(
        new URL(request.url).pathname.endsWith("/confirm")
          ? "confirm"
          : "register",
        60,
      ),
    preferences: async (token) => {
      const id = await activation.contactForChallenge(token);
      return id ? `/email-preferences#${preferenceTokens.issue(id)}` : null;
    },
  });
  return Object.freeze({
    async handle(request) {
      const url = new URL(request.url);
      if (url.origin !== origin) return json(404, { accepted: false });
      if (url.pathname === "/health" && request.method === "GET")
        return json(200, { status: "ok" });
      if (url.pathname === "/api/v1/marketing-leads/resend-webhook") {
        if (!(await activation.allowRequest("webhook", 600)))
          return json(429, { accepted: false });
        return webhook(request);
      }
      if (url.pathname === "/email-preferences" && request.method === "GET")
        return preferencePage();
      if (url.pathname === "/api/v1/marketing-leads/preferences") {
        if (!(await activation.allowRequest("preferences", 120)))
          return json(429, { accepted: false });
        return preferences(request);
      }
      return verified(request);
    },
    async workOnce() {
      const audiences = {};
      for (const destination of ["resend", "meta", "google"])
        if (audienceAdapters[destination]) {
          try {
            audiences[destination] = await activation.runAudience(
              destination,
              audienceAdapters[destination],
            );
          } catch {
            audiences[destination] = {
              processed: false,
              error: "AUDIENCE_WORK_FAILED",
            };
          }
        }
      let email;
      try {
        email = await sendNextLeadVerification({
          store: leads,
          transport: emailTransport,
          preferenceTokens,
        });
      } catch {
        email = { processed: false, error: "EMAIL_WORK_FAILED" };
      }
      return { email, audiences };
    },
    metrics: () => activation.metrics(),
  });
}
/** No mode defaults to active. Credentials are supplied by secret references, never browser config. */
export async function loadMarketingRuntime({
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  if (
    env.SAMRA_MARKETING_MODE !== "verified" ||
    env.SAMRA_CLOUD_PROJECT_ID !== "samra-pay-production" ||
    (env.K_SERVICE !== "samra-launch-updates" &&
      env.CLOUD_RUN_JOB !== "samra-marketing-worker") ||
    env.SAMRA_EMAIL_TRACKING_DISABLED !== "true"
  )
    throw new Error("MARKETING_ACTIVATION_CONFIGURATION_REQUIRED");
  const raw = JSON.parse(env.SAMRA_MARKETING_TOKEN_KEYS ?? "{}");
  const keys = Object.fromEntries(
    Object.entries(raw).map(([v, k]) => {
      if (typeof k !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(k))
        throw new Error("INVALID_TOKEN_KEY");
      return [v, Buffer.from(k, "base64")];
    }),
  );
  const activeVersion = env.SAMRA_MARKETING_TOKEN_KEY_VERSION;
  const preferenceTokens = createPreferenceTokens({ keys, activeVersion });
  const { createMarketingPersistence } = await import("@workspace/db");
  const persistence = createMarketingPersistence({
    connectionString: env.SAMRA_MARKETING_DATABASE_URL,
    ca: env.SAMRA_MARKETING_DATABASE_CA,
    keys,
    activeVersion,
  });
  try {
    const emailTransport = createResendTransport({
      apiKey: env.RESEND_API_KEY,
      fetchImpl,
    });
    const audienceAdapters = {
      resend: createResendContactAdapter({
        transport: createResendWaitlistTransport({
          apiKey: env.RESEND_API_KEY,
          fetchImpl,
        }),
        suppression: emailTransport,
        segmentId: env.SAMRA_RESEND_VERIFIED_SEGMENT_ID,
        topicId: env.SAMRA_RESEND_VERIFIED_TOPIC_ID,
      }),
    };
    // Individual destinations are independent. No terms are accepted by creating this configuration.
    if (env.SAMRA_META_SYNC_ENABLED === "true")
      audienceAdapters.meta = createMetaAudienceAdapter({
        audienceId: env.SAMRA_META_AUDIENCE_ID,
        apiVersion: env.SAMRA_META_API_VERSION,
        termsAccepted: env.SAMRA_META_TERMS_ACCEPTED === "true",
        accessToken: async () => env.META_ACCESS_TOKEN,
        fetchImpl,
      });
    if (env.SAMRA_GOOGLE_SYNC_ENABLED === "true")
      audienceAdapters.google = createGoogleAudienceAdapter({
        accountId: env.SAMRA_GOOGLE_ADS_ACCOUNT_ID,
        audienceId: env.SAMRA_GOOGLE_AUDIENCE_ID,
        termsAccepted:
          env.SAMRA_GOOGLE_CUSTOMER_MATCH_TERMS_ACCEPTED === "true",
        accessToken: createGoogleMarketingToken({
          clientId: env.GOOGLE_MARKETING_CLIENT_ID,
          clientSecret: env.GOOGLE_MARKETING_CLIENT_SECRET,
          refreshToken: env.GOOGLE_MARKETING_REFRESH_TOKEN,
          fetchImpl,
        }),
        fetchImpl,
      });
    return {
      ...createMarketingApplication({
        ...persistence,
        preferenceTokens,
        webhookSecret: env.RESEND_WEBHOOK_SECRET,
        emailTransport,
        audienceAdapters,
      }),
      close: persistence.close,
    };
  } catch (error) {
    await persistence.close();
    throw error;
  }
}
