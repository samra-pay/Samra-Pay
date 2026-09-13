import { createHash } from "node:crypto";
export const MARKETING_NOTICE_VERSION = "marketing-2026-09-09";
const ORIGIN = "https://www.samrapay.com";
const script = `const token=location.hash.slice(1);history.replaceState(null,'',location.pathname);document.querySelector('form').addEventListener('submit',async(e)=>{e.preventDefault();const b=document.querySelector('button');b.disabled=true;try{const r=await fetch('/api/v1/marketing-leads/confirm',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,adsConsent:document.querySelector('#ads').checked&&navigator.globalPrivacyControl!==true&&navigator.doNotTrack!=='1'})});const d=await r.json();if(r.ok&&d.confirmed&&typeof d.preferencesUrl==='string'&&d.preferencesUrl.startsWith('/email-preferences#')){const a=document.createElement('a');a.href=d.preferencesUrl;a.textContent='Manage preferences / ምርጫዎን ያስተዳድሩ';document.querySelector('main').append(a);}document.querySelector('#result').textContent=r.ok&&d.confirmed?'Email confirmed. / ኢሜይልዎ ተረጋግጧል።':'This link is unavailable or expired. / ይህ አገናኝ አይገኝም ወይም ጊዜው አልፎበታል።';}catch{document.querySelector('#result').textContent='Please try again. / እንደገና ይሞክሩ።';b.disabled=false;}});`;
const csp = `default-src 'none'; script-src 'sha256-${createHash("sha256").update(script).digest("base64")}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`;
const page = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Confirm Samra Pay email updates</title><main><h1>Confirm email updates</h1><p>Confirm that you want Samra Pay email updates. You can unsubscribe anytime. Opening this page does not confirm your email.</p><p lang="am">የSamra Pay ኢሜይል መረጃ መቀበል እንደሚፈልጉ ያረጋግጡ። በፈለጉት ጊዜ ምዝገባ ማቋረጥ ይችላሉ። ይህን ገጽ መክፈት ብቻ ኢሜይልዎን አያረጋግጥም።</p><form><label><input id="ads" type="checkbox"> Also confirm my requested permission for Samra Pay to share my email with Meta and Google to match my account for personalized Samra Pay ads. Optional; not required for email updates.</label><p lang="am">ከዚህ በፊት የጠየቅኩትን፣ Samra Pay ለእኔ የተዘጋጁ ማስታወቂያዎችን ለማሳየት ኢሜይሌን ከMeta እና Google ጋር እንዲያጋራ የሰጠሁትን ፈቃድ አረጋግጣለሁ። አማራጭ ነው፤ ኢሜይል ለመቀበል አያስፈልግም።</p><button>Confirm email updates / ኢሜይል መረጃን ያረጋግጡ</button></form><p id="result" role="status"></p><a href="/privacy">Privacy policy</a></main><script>${script}</script></html>`;
function response(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
async function readBody(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("INVALID_BODY");
  let size = 0;
  const chunks = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) throw new Error("INVALID_BODY");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    await reader.cancel().catch(() => {});
  }
}
/** Prepared adapter, not mounted by public-server.mjs. A durable store and
 * enforced edge/request limiter must be explicitly supplied before activation. */
export function createVerifiedLeadHandler({
  store,
  allowRequest,
  preferences,
} = {}) {
  if (
    !store ||
    typeof store.register !== "function" ||
    typeof store.confirm !== "function" ||
    typeof allowRequest !== "function"
  )
    throw new Error("VERIFIED_LEAD_CONFIGURATION_REQUIRED");
  return async (request) => {
    const url = new URL(request.url);
    if (url.origin !== ORIGIN) return response(404, { status: "not_found" });
    if (url.pathname === "/confirm-email" && request.method === "GET")
      return new Response(page, {
        headers: {
          "Content-Type": "text/html;charset=utf-8",
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
          "Content-Security-Policy": csp,
          "X-Content-Type-Options": "nosniff",
        },
      });
    if (
      !["/api/v1/marketing-leads", "/api/v1/marketing-leads/confirm"].includes(
        url.pathname,
      )
    )
      return response(404, { status: "not_found" });
    if (request.method !== "POST")
      return response(405, { status: "method_not_allowed" });
    if (
      request.headers.get("origin") !== ORIGIN ||
      !/^application\/json(?:;|$)/i.test(
        request.headers.get("content-type") ?? "",
      )
    )
      return response(422, { accepted: false });
    try {
      if (!(await allowRequest(request)))
        return response(429, { accepted: false });
      const body = await readBody(request);
      if (!body || typeof body !== "object" || Array.isArray(body))
        return response(422, { accepted: false });
      if (url.pathname.endsWith("/confirm")) {
        if (
          typeof body.token !== "string" ||
          typeof body.adsConsent !== "boolean"
        )
          return response(422, { confirmed: false });
        const confirmed = await store.confirm(
          body.token,
          body.adsConsent && request.headers.get("sec-gpc") !== "1",
        );
        const preferencesUrl =
          confirmed && preferences ? await preferences(body.token) : null;
        return response(200, {
          confirmed,
          ...(preferencesUrl ? { preferencesUrl } : {}),
        });
      }
      if (
        body.noticeVersion !== MARKETING_NOTICE_VERSION ||
        body.emailConsent !== true ||
        typeof body.adsConsent !== "boolean" ||
        !["en", "am"].includes(body.locale)
      )
        return response(422, { accepted: false });
      const website = body.website ?? "";
      if (typeof website !== "string" || website.length > 300)
        return response(422, { accepted: false });
      if (website) return response(202, { accepted: true });
      await store.register({
        email: body.email,
        emailConsent: true,
        adsConsent: body.adsConsent && request.headers.get("sec-gpc") !== "1",
        noticeVersion: MARKETING_NOTICE_VERSION,
        locale: body.locale,
        idempotencyKey: request.headers.get("idempotency-key") ?? "",
        attribution: body.attribution,
      });
      return response(202, { accepted: true });
    } catch {
      return response(503, { accepted: false });
    }
  };
}

export async function sendNextLeadVerification({
  store,
  transport,
  preferenceTokens,
}) {
  const claim = await store.claimVerificationEmail();
  if (!claim) return { processed: false };
  const sent = await store.deliverVerificationEmail(
    claim.id,
    claim.leaseId,
    async (message) => {
      if (
        transport.getSuppression &&
        (await transport.getSuppression(message.email))
      )
        return { suppressed: true };
      if (
        transport.getContact &&
        (await transport.getContact(message.email))?.unsubscribed
      )
        return { suppressed: true };
      const url = `${ORIGIN}/confirm-email#${message.token}`;
      const preferenceUrl = preferenceTokens
        ? `https://www.samrapay.com/email-preferences#${preferenceTokens.issue(message.contactId)}`
        : null;
      await transport.sendConfirmation({
        email: message.email,
        from: "Samra Pay <updates@mail.samrapay.com>",
        replyTo: "support@samrapay.com",
        idempotencyKey: message.idempotencyKey,
        subject:
          message.locale === "am"
            ? "የSamra Pay ኢሜይል መረጃን ያረጋግጡ"
            : "Confirm Samra Pay email updates",
        text:
          (message.locale === "am"
            ? `የSamra Pay ኢሜይል መረጃን ከጠየቁ፣ ይህን አገናኝ ከፍተው ያረጋግጡ። ካልጠየቁ ይህን ኢሜይል ይተዉት። አገናኙ በ24 ሰዓት ያበቃል።\n\n${url}`
            : `If you requested Samra Pay email updates, open this link and confirm your choice. Otherwise, ignore this email. The link expires in 24 hours. Advertising permission is optional and must be confirmed separately on the page.\n\n${url}`) +
          (preferenceUrl
            ? `\n\nManage preferences / ምርጫዎን ያስተዳድሩ: ${preferenceUrl}`
            : ""),
      });
    },
  );
  return { processed: sent };
}
