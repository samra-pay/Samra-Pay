import { Webhook } from "svix";
import { createHash } from "node:crypto";
import { readBoundedText, json } from "./marketing-http.mjs";
export function createMarketingWebhook({ secret, store }) {
  const verifier = new Webhook(secret);
  return async (request) => {
    if (request.method !== "POST") return json(405, { accepted: false });
    let raw, event;
    try {
      raw = await readBoundedText(request, 32768);
      verifier.verify(raw, {
        "svix-id": request.headers.get("svix-id"),
        "svix-timestamp": request.headers.get("svix-timestamp"),
        "svix-signature": request.headers.get("svix-signature"),
      });
      event = JSON.parse(raw);
    } catch {
      return json(400, { accepted: false });
    }
    try {
      const type = event?.type;
      if (
        typeof type !== "string" ||
        type.length > 80 ||
        !event.data ||
        typeof event.data !== "object"
      )
        return json(422, { accepted: false });
      let email = null,
        reason = null;
      if (
        ["email.bounced", "email.complained", "email.suppressed"].includes(type)
      ) {
        if (!Array.isArray(event.data.to) || event.data.to.length !== 1)
          return json(422, { accepted: false });
        email = event.data.to[0];
        reason =
          type === "email.bounced"
            ? "bounced"
            : type === "email.complained"
              ? "complained"
              : "unsubscribed";
      } else if (
        type === "contact.updated" &&
        event.data.unsubscribed === true
      ) {
        email = event.data.email;
        reason = "unsubscribed";
      } else if (type === "suppression.added") {
        email = event.data.email;
        reason = "unsubscribed";
      }
      if (
        reason &&
        (typeof email !== "string" ||
          email.length > 254 ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      )
        return json(422, { accepted: false });
      await store.providerEvent({
        id: request.headers.get("svix-id"),
        payloadHash: createHash("sha256").update(raw).digest("hex"),
        type,
        email,
        reason,
      });
      return json(200, { accepted: true });
    } catch {
      return json(503, { accepted: false });
    }
  };
}
