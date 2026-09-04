import { useId, useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { localized, usePublicLanguage } from "@/lib/public-i18n";

// Presentation-only until the separately reviewed Resend endpoint is connected.
// No email leaves this component, enters storage, or is sent to analytics.
export function isLocalUpdatesPreview(hostname: string) {
  return ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
}

export function LaunchUpdatesForm() {
  const { text } = usePublicLanguage();
  const fieldId = useId();
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<"email" | "consent" | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const preview = isLocalUpdatesPreview(window.location.hostname);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview) return;
    const address = email.trim();
    if (address.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError("email");
      return;
    }
    if (!consent) {
      setError("consent");
      return;
    }
    setError(null);
    setEmail("");
    setConsent(false);
    setReviewed(true);
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
      {preview && (
        <p className="launch-updates-preview">
          {text(
            localized(
              "Local test only. No email is saved or sent.",
              "ለአካባቢ ሙከራ ብቻ። ኢሜይል አይቀመጥም ወይም አይላክም።",
            ),
          )}
        </p>
      )}
      {reviewed ? (
        <div className="launch-updates-result" role="status">
          <div>
            <p>
              {text(
                localized(
                  "Test complete. No subscription created.",
                  "ሙከራው ተጠናቋል። ምዝገባ አልተፈጠረም።",
                ),
              )}
            </p>
            <button type="button" onClick={() => setReviewed(false)}>
              {text(localized("Test again", "እንደገና ይሞክሩ"))}
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
              disabled={!preview}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setError(null);
              }}
              aria-invalid={error === "email" || undefined}
              aria-describedby={
                error === "email" ? `${fieldId}-error` : undefined
              }
            />
            <button type="submit" disabled={!preview}>
              {text(localized("Keep me informed", "መረጃ ይላኩልኝ"))}
              <ArrowRight aria-hidden="true" />
            </button>
          </div>
          <label
            className="launch-updates-consent"
            htmlFor={`${fieldId}-consent`}
          >
            <input
              id={`${fieldId}-consent`}
              type="checkbox"
              checked={consent}
              disabled={!preview}
              required
              onChange={(event) => {
                setConsent(event.target.checked);
                setError(null);
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
          {!preview && (
            <p className="launch-updates-preview" role="status">
              {text(
                localized(
                  "Email sign-up opens shortly.",
                  "የኢሜይል ምዝገባ በቅርቡ ይከፈታል።",
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
