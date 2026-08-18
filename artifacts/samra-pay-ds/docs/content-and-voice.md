# Content and Voice — Samra Pay Design System

This document defines the language standards for all Samra Pay UI copy. It covers English and Amharic guidelines, formatting standards, error message tone, status label requirements, and rate/fee disclosure language.

---

## 1. Brand Voice

**Core voice attributes:**
- **Trustworthy** — confident, honest, never overselling
- **Warm** — human, not robotic; culturally aware of both Ethiopian and diaspora contexts
- **Clear** — plain language, no jargon, no banking-speak
- **Respectful** — acknowledges that users are handling real money for real people

**Samra Pay is not:**
- Hype-driven ("Amazing rates!", "Send money in a flash!")
- Paternalistic ("We've made it easy for you" — users already know money transfer)
- Vague ("Something went wrong" with no further guidance)

---

## 2. English Writing Guidelines

### Sentence structure
- Use active voice: "Your transfer is complete" not "Your transfer has been completed by our system."
- Address the user directly: "You're sending" not "The sender is sending."
- Keep sentences short — 15–20 words maximum for instructional copy.
- Avoid gerunds in headings: "Review your transfer" not "Reviewing your transfer."

### Currency and amount copy
- Always use ISO 4217 codes: `ETB`, `USD`, `GBP`, `EUR`, `SAR`, `CAD`, `AED`.
- Never use currency symbols alone: not `$`, `£`, `Br`, `€`.
- Format: `[amount] [currency code]`, e.g. `56.45 ETB`, `2.99 USD`.
- Never use "dollars" or "birr" in UI copy — use `USD` and `ETB`.

### Numbers
- Format large numbers with commas: `1,234,567.89` not `1234567.89`.
- Always show 2 decimal places for financial amounts: `0.00` not `0`.
- For exchange rates, show as many decimal places as the API provides — do not truncate.

### Dates and times
- Use unambiguous date format: `14 Jul 2025` or `Jul 14, 2025` — not `14/07/25` (ambiguous across locales).
- Use 12-hour clock with AM/PM for user-facing times: `3:45 PM` not `15:45`.
- UTC times must be explicitly labeled: `3:45 PM UTC`.
- Relative times: "2 minutes ago", "Updated 5 min ago" — never "just now" (vague).
- Estimated delivery: "1–2 business days" — use ranges, not false precision.

### Phone numbers
- Format Ethiopian: `+251 91 234 5678`.
- Never store or display phone numbers without the country code prefix.
- Mask partial numbers for security: `+251 91 *** **78`.

### Account number masking
- Display as: `•••• •••• •••• 4321` (last 4 digits visible).
- Never show the full account number in UI.
- Mask consistently — the same account shows the same mask everywhere.

### Transfer IDs and reference numbers
- Display in a monospace font for readability.
- Format consistently: `TXN-123456-ABCD` (all caps, hyphen-separated).
- Always make selectable/copyable — users need to quote these to support.

---

## 3. Amharic (አማርኛ) Guidelines

### When to use Amharic
- Amharic-speaking users may have their device language set to Amharic or English.
- UI labels should follow the device language setting.
- Error messages should be in the same language as the rest of the UI.
- Never mix languages in a single sentence (English + Amharic in one phrase).

### Amharic writing standards
- Use standard Ethiopian orthography — not phonetic transliteration.
- Amharic does not use commas for number formatting — use the Ethiopic number separator or Western commas based on user preference.
- Amharic dates: use Ethiopian calendar if the user has selected it, Gregorian calendar otherwise. Always label which calendar is being used.
- Never use Google-translated Amharic for financial amounts — financial terminology must be reviewed by a native speaker.
- "Transfer" in Amharic: ዝውውር (ziwiwir) for money transfer — verify with native speakers for specific usage.

### Technical Amharic notes
- Use Noto Serif Ethiopic (`ethiopic` font family token) for all Amharic text.
- Line height must be ≥ 1.5 for body text (token: `ethiopic.body.lineHeight = 1.7`).
- Test all Amharic strings for overflow — Amharic is typically 20–40% longer than equivalent English.
- Right-to-left (RTL) is NOT required for Amharic — Ge'ez script is left-to-right.

---

## 4. Error Message Tone

### Principles
- Acknowledge what happened without blame.
- Explain what the user should do next.
- Provide a support path when automated recovery is not possible.
- Never use technical jargon (error codes, HTTP status codes, exception names) as user-facing copy.

### Error message structure
1. What happened (brief, plain language)
2. What the user should do (actionable)
3. Support reference (if applicable)

### Error copy examples

**Failed transfer:**
- ✅ "Transfer failed — your funds have not been deducted. Please try again or contact support."
- ❌ "Error: Payment gateway timeout. Code: 504."

**Network error:**
- ✅ "Unable to connect — check your internet connection and try again."
- ❌ "Network error"

**Expired rate:**
- ✅ "Your rate has expired. Refresh to get a new quote before continuing."
- ❌ "Quote expired. Please try again."

**Invalid amount:**
- ✅ "Please enter an amount greater than 0.01 USD to continue."
- ❌ "Invalid amount."

**Insufficient balance:**
- ✅ "Your available balance is [amount] [currency]. Please enter a lower amount."
- ❌ "Insufficient funds."

---

## 5. Status Label Requirements

All status displays must include both a visible text label and an icon. Status labels must be specific to the context:

| Context | Submitted | Processing | Completed | Failed |
|---------|-----------|-----------|-----------|--------|
| Transfer | "Transfer submitted" | "Processing transfer" | "Transfer complete" | "Transfer failed" |
| Refund | "Refund submitted" | "Processing refund" | "Refund complete" | "Refund failed" |
| Verification | "Verification pending" | "Verifying" | "Verified" | "Verification failed" |

Never use generic single-word status labels alone ("Pending", "Done") without context.

---

## 6. Rate and Fee Disclosure Language

### Mandatory disclosures
All screens showing an exchange rate or fee must include:
1. The exact rate: `1 USD = 56.45 ETB`
2. The fee amount and currency: `Transfer fee: 2.99 USD`
3. Rate validity: `Rate valid for 4:32`

### Disclosure copy standards

**Exchange rate:**
- ✅ "1 USD = 56.45 ETB · Rate expires in 4:32"
- ✅ "Exchange rate: 1 USD = 56.45 ETB (inclusive of all fees)"
- ❌ "Great rate!" (unsubstantiated)
- ❌ "Best rate" (superlative without evidence)
- ❌ "Real-time rate" (only if rate is genuinely live — < 5 second latency)

**Fees:**
- ✅ "Transfer fee: 2.99 USD" (specific amount shown)
- ✅ "No transfer fee for this corridor" (only if literally zero)
- ❌ "Low fees" (vague without amount)
- ❌ "0% fee" (if there is a rate spread — the fee is embedded)

**Regulatory:**
- If a fee is embedded in the exchange rate spread, disclose: "The exchange rate includes our service fee."
- If the rate is mid-market: "We use the mid-market exchange rate."
- Never claim "no fees" when a fee is embedded in the spread.

---

## 7. Prohibited Copy Patterns

The following patterns are prohibited across all Samra Pay UI surfaces:

| Pattern | Reason |
|---------|--------|
| "Best rate in the market" | Unsubstantiated superlative — misleading |
| "Zero fees" / "No fees" when fee is embedded in spread | Deceptive |
| "Instant transfer" | Must match actual delivery time per API |
| "Guaranteed delivery" | Requires legal review — regulatory risk |
| "Your money is safe" | Regulatory language — requires legal + compliance review |
| "Money sent!" on submission | False — submission ≠ delivery |
| "Almost done!" | False urgency, uncertain |
| "The best way to send money" | Unsubstantiated, potentially misleading |
| "Ethiopian spirit" / "Land of origins" | Cultural cliché — not relevant to remittance |
| "[Competitor] charges more" | Comparative advertising without cited data |
| "Official partner of Ethiopian Airlines / ShebaMiles" | Only if contractually true |
| Technical error codes as user copy | Error code 404, HTTP 500, etc. |
| Passive aggressive error messages | "You failed to enter..." |
| Blame-shifting errors | "You didn't provide..." → "Please enter..." |
| False urgency | "Hurry! Rate changes soon" when rate is stable |
| Vague success | "Done!" without confirming what is done |

---

## 8. Accessibility Copy Requirements

- All interactive elements must have a visible label or `aria-label`.
- Icon-only buttons must have an `accessibilityLabel` describing the action.
- Financial amounts: `accessibilityLabel` must read "[amount] [currency]" e.g. "1,234.56 ETB".
- Status badges: `accessibilityLabel` must read "Status: [status name]".
- Disabled buttons: add `aria-disabled="true"` and explain why (e.g., "Submit disabled — refresh quote first").
- Loading states: `aria-busy="true"` + `aria-label` describing what is loading.

---

## 9. Formatting Cheatsheet

| Item | Format | Example |
|------|--------|---------|
| Currency amounts | `[amount] [ISO code]` | `1,234.56 ETB` |
| Exchange rate | `1 [send] = [rate] [receive]` | `1 USD = 56.45 ETB` |
| Dates | `D Mon YYYY` | `14 Jul 2025` |
| Times | `H:MM AM/PM` | `3:45 PM` |
| Phone (ET) | `+251 XX XXX XXXX` | `+251 91 234 5678` |
| Account mask | `•••• XXXX` | `•••• 4321` |
| Transfer ID | Monospace, selectable | `TXN-123456-ABCD` |
| Percentage rates | 2 decimal places min | `2.50%` not `2.5%` |
| Large numbers | Comma-separated | `1,234,567.89` |
