import { useId, useRef, useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { localized, usePublicLanguage } from "@/lib/public-i18n";
import { trackPublicWaitlistEvent } from "@/lib/public-analytics";

export function LaunchUpdatesForm() {
  const { language, text } = usePublicLanguage();
  const fieldId = useId();
  const startMeasured = useRef(false);
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<"email" | "consent" | null>(null);
  const [serviceError, setServiceError] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting" | "accepted">(
    "idle",
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "submitting") return;
    const address = email.trim();
    if (address.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      if (!website) trackPublicWaitlistEvent("invalid_email");
      setError("email");
      return;
    }
    if (!consent) {
      if (!website) trackPublicWaitlistEvent("missing_consent");
      setError("consent");
      return;
    }
    setError(null);
    setServiceError(false);
    setStatus("submitting");
    try {
      const { subscribePublicWaitlist } = await import("@/lib/public-waitlist");
      await subscribePublicWaitlist({
        email: address,
        locale: language,
        website,
      });
      if (!website) trackPublicWaitlistEvent("accepted");
      setEmail("");
      setConsent(false);
      setWebsite("");
      setStatus("accepted");
    } catch {
      if (!website) trackPublicWaitlistEvent("service_error");
      setServiceError(true);
      setStatus("idle");
    }
  }

  return (
    <section
      className="launch-updates"
      id="launch-updates"
      aria-labelledby={`${fieldId}-title`}
    >
      <h2 id={`${fieldId}-title`}>
        {text(localized("Stay informed", "ዜና ይከታተሉ"))}
      </h2>
      {status === "accepted" ? (
        <div className="launch-updates-result" role="status">
          <div>
            <p>
              {text(
                localized(
                  "You're on the pre-launch list. We'll keep you informed.",
                  "በቅድመ ማስጀመሪያ ዝርዝሩ ውስጥ ገብተዋል። መረጃ እናደርስዎታለን።",
                ),
              )}
            </p>
            <button type="button" onClick={() => setStatus("idle")}>
              {text(localized("Add another email", "ሌላ ኢሜይል ያክሉ"))}
            </button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={submit}
          noValidate
          aria-describedby={`${fieldId}-notice`}
        >
          <label className="launch-updates-label" htmlFor={`${fieldId}-email`}>
            {text(localized("Email address", "የኢሜይል አድራሻ"))}
          </label>
          <div className="launch-updates-row">
            <input
              id={`${fieldId}-email`}
              type="email"
              autoComplete="email"
              inputMode="email"
              maxLength={254}
              placeholder="you@example.com"
              required
              disabled={status === "submitting"}
              value={email}
              onChange={(event) => {
                if (!startMeasured.current && !website)
                  startMeasured.current = trackPublicWaitlistEvent("started");
                setEmail(event.target.value);
                setError(null);
                setServiceError(false);
              }}
              aria-invalid={error === "email" || undefined}
              aria-describedby={
                error === "email" ? `${fieldId}-error` : undefined
              }
            />
            <button type="submit" disabled={status === "submitting"}>
              {status === "submitting"
                ? text(localized("Saving…", "በማስቀመጥ ላይ…"))
                : text(localized("Keep me informed", "መረጃ ይላኩልኝ"))}
              <ArrowRight aria-hidden="true" />
            </button>
          </div>
          <div className="launch-updates-honeypot" aria-hidden="true">
            <label htmlFor={`${fieldId}-website`}>Website</label>
            <input
              id={`${fieldId}-website`}
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
            />
          </div>
          <label
            className="launch-updates-consent"
            htmlFor={`${fieldId}-consent`}
          >
            <input
              id={`${fieldId}-consent`}
              type="checkbox"
              checked={consent}
              disabled={status === "submitting"}
              required
              onChange={(event) => {
                setConsent(event.target.checked);
                setError(null);
                setServiceError(false);
              }}
              aria-invalid={error === "consent" || undefined}
              aria-describedby={
                error === "consent" ? `${fieldId}-error` : undefined
              }
            />
            <span>
              {text(
                localized(
                  "I agree to Samra Pay email updates. Unsubscribe anytime.",
                  "የSamra Pay ኢሜይል መረጃን እፈቅዳለሁ። በፈለጉት ጊዜ ምዝገባ ማቋረጥ ይችላሉ።",
                ),
              )}
            </span>
          </label>
          {error && (
            <p
              className="launch-updates-error"
              role="alert"
              id={`${fieldId}-error`}
            >
              {text(
                error === "email"
                  ? localized("Enter a valid email.", "ትክክለኛ ኢሜይል ያስገቡ።")
                  : localized(
                      "Email consent is required.",
                      "የኢሜይል ፈቃድ ያስፈልጋል።",
                    ),
              )}
            </p>
          )}
          {serviceError && (
            <p className="launch-updates-error" role="alert">
              {text(
                localized(
                  "We couldn't save your email. Please try again.",
                  "ኢሜይልዎን ማስቀመጥ አልቻልንም። እባክዎ እንደገና ይሞክሩ።",
                ),
              )}
            </p>
          )}
        </form>
      )}
      <p className="launch-updates-notice" id={`${fieldId}-notice`}>
        <a href="/privacy">{text(localized("Privacy policy", "የግላዊነት ፖሊሲ"))}</a>
      </p>
    </section>
  );
}

export default LaunchUpdatesForm;
