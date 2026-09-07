import { useId, useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import {
  normalizeWaitlistPhone,
  type PhoneCountry,
} from "@/lib/waitlist-phone";
import { localized, usePublicLanguage } from "@/lib/public-i18n";

export function LaunchUpdatesForm() {
  const { language, text } = usePublicLanguage();
  const fieldId = useId();
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneCountry, setPhoneCountry] = useState<PhoneCountry>("US");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<
    "email" | "consent" | "phone" | "name" | null
  >(null);
  const [serviceError, setServiceError] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting" | "accepted">(
    "idle",
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "submitting") return;
    const address = email.trim();
    if (address.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError("email");
      return;
    }
    if (firstName.length > 100 || /[\p{Cc}\p{Cf}]/u.test(firstName)) {
      setError("name");
      return;
    }
    const normalizedPhone = normalizeWaitlistPhone(phoneNumber, phoneCountry);
    if (normalizedPhone === null) {
      setError("phone");
      return;
    }
    if (!consent) {
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
        firstName,
        phoneNumber: normalizedPhone,
        locale: language,
        website,
      });
      setEmail("");
      setFirstName("");
      setPhoneNumber("");
      setConsent(false);
      setWebsite("");
      setStatus("accepted");
    } catch {
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
          <div className="launch-updates-profile">
            <label
              className="launch-updates-label"
              htmlFor={`${fieldId}-first-name`}
            >
              {text(localized("First name (optional)", "ስም (አማራጭ)"))}
            </label>
            <input
              id={`${fieldId}-first-name`}
              name="firstName"
              type="text"
              autoComplete="given-name"
              maxLength={100}
              disabled={status === "submitting"}
              value={firstName}
              onChange={(event) => {
                setFirstName(event.target.value);
                setError(null);
                setServiceError(false);
              }}
              aria-invalid={error === "name" || undefined}
              aria-describedby={
                error === "name" ? `${fieldId}-error` : undefined
              }
            />
            <label
              className="launch-updates-label"
              htmlFor={`${fieldId}-phone`}
            >
              {text(
                localized("Mobile number (optional)", "የሞባይል ስልክ ቁጥር (አማራጭ)"),
              )}
            </label>
            <div className="launch-updates-phone-row">
              <select
                aria-label={text(
                  localized("Phone country code", "የስልክ አገር ኮድ"),
                )}
                value={phoneCountry}
                disabled={status === "submitting"}
                onChange={(event) => {
                  setPhoneCountry(event.target.value as PhoneCountry);
                  setError(null);
                }}
              >
                <option value="US">
                  {text(localized("US / Canada (+1)", "አሜሪካ / ካናዳ (+1)"))}
                </option>
                <option value="ET">
                  {text(localized("Ethiopia (+251)", "ኢትዮጵያ (+251)"))}
                </option>
                <option value="international">
                  {text(localized("Other country", "ሌላ አገር"))}
                </option>
              </select>
              <input
                id={`${fieldId}-phone`}
                name="phoneNumber"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                maxLength={32}
                placeholder={
                  phoneCountry === "US"
                    ? "202 555 0123"
                    : phoneCountry === "ET"
                      ? "091 123 4567"
                      : "+44 7700 900123"
                }
                disabled={status === "submitting"}
                value={phoneNumber}
                onChange={(event) => {
                  setPhoneNumber(event.target.value);
                  setError(null);
                  setServiceError(false);
                }}
                aria-invalid={error === "phone" || undefined}
                aria-describedby={`${fieldId}-phone-help${error === "phone" ? ` ${fieldId}-error` : ""}`}
              />
            </div>
            <p className="launch-updates-notice" id={`${fieldId}-phone-help`}>
              {text(
                localized(
                  "For other countries, include + and the country code. Adding a number does not opt you into text messages.",
                  "ለሌሎች አገሮች + እና የአገር ኮዱን ያካትቱ። ቁጥር ማስገባት የጽሑፍ መልዕክቶችን ለመቀበል ፈቃድ መስጠት አይደለም።",
                ),
              )}
            </p>
          </div>
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
                error === "name"
                  ? localized(
                      "Enter a name of up to 100 characters.",
                      "እስከ 100 ፊደላት ያለው ስም ያስገቡ።",
                    )
                  : error === "phone"
                    ? localized(
                        "Check the mobile number and country code.",
                        "የሞባይል ቁጥሩን እና የአገር ኮዱን ያረጋግጡ።",
                      )
                    : error === "email"
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
