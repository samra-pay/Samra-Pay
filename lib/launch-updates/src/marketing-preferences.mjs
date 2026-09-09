import { createHash, randomUUID } from "node:crypto";
import { json, readBoundedText } from "./marketing-http.mjs";
const script = `const token=location.hash.slice(1);history.replaceState(null,'',location.pathname);document.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const b=document.querySelector('button');b.disabled=true;try{const r=await fetch('/api/v1/marketing-leads/preferences',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,scope:document.querySelector('select').value})});document.querySelector('[role=status]').textContent=r.ok?'Your preference is saved. / ምርጫዎ ተቀምጧል።':'This link is unavailable or expired. / ይህ አገናኝ ጊዜው አልፎበታል።';}catch{document.querySelector('[role=status]').textContent='Please try again. / እንደገና ይሞክሩ።';}finally{b.disabled=false;}});`;
export function preferencePage() {
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Samra Pay preferences</title><main><h1>Email and advertising preferences</h1><p>Opening this page does not change your choices. Stopping advertising matching keeps email updates active. Stopping everything also stops email updates.</p><p lang="am">ይህን ገጽ መክፈት ምርጫዎን አይቀይርም። ማስታወቂያ ማዛመድን ብቻ ማቆም የኢሜይል መረጃን አያቆምም። ሁሉንም ማቆም የኢሜይል መረጃንም ያቆማል።</p><form><label for="scope">Your choice / ምርጫዎ</label><select id="scope"><option value="all">Stop email updates and advertising matching / ሁሉንም ያቁሙ</option><option value="ads">Stop advertising matching only / ማስታወቂያ ማዛመድን ብቻ ያቁሙ</option></select><button>Save preference / ምርጫዎን ያስቀምጡ</button></form><p role="status"></p><p>Audience removal may take time to process. This does not prevent ads shown without using our customer list.</p><a href="/privacy">Privacy policy</a></main><script>${script}</script></html>`,
    {
      headers: {
        "Content-Type": "text/html;charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": `default-src 'none'; script-src 'sha256-${createHash("sha256").update(script).digest("base64")}'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`,
      },
    },
  );
}
export function createPreferenceHandler({ tokens, leads }) {
  return async (request) => {
    if (request.method !== "POST") return json(405, { accepted: false });
    if (
      request.headers.get("origin") !== "https://www.samrapay.com" ||
      !/^application\/json(?:;|$)/i.test(
        request.headers.get("content-type") ?? "",
      )
    )
      return json(422, { accepted: false });
    try {
      const body = JSON.parse(await readBoundedText(request));
      const id = tokens.verify(body.token);
      if (!id || !["all", "ads"].includes(body.scope))
        return json(422, { accepted: false });
      const command = randomUUID();
      if (body.scope === "all")
        await leads.withdraw(id, "unsubscribed", command);
      else await leads.withdrawAdvertising(id, command);
      return json(200, { accepted: true });
    } catch {
      return json(503, { accepted: false });
    }
  };
}
