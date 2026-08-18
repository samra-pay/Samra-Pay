# Financial UI Truth — Samra Pay Design System

This document defines mandatory rules for all financial UI in Samra Pay. Every rule is enforceable in design review and code review. Deviations require explicit exception approval.

---

## 1. Non-Negotiable Mandatory Rules

### 1.1 Amounts and Currencies

**MANDATORY: Display amounts as received — never reformat.**
- Display the `amount` string exactly as provided by the API or consumer prop.
- Never call `parseFloat()`, `toFixed()`, `Number()`, `Math.round()`, or any numeric function on an amount string in a display component.
- Never concatenate currency codes into amounts (display currency separately).
- Never silently truncate decimal places.

**MANDATORY: Currency code must always accompany the amount.**
- Wrong: `ETB 1,234.56` displayed without label context.
- Right: Amount `1,234.56` displayed with separate currency label `ETB`.
- Exception: If the currency is unambiguous from screen context (e.g., a single-currency balance hero), the code may appear once at the top level — never omit it entirely.

**MANDATORY: Use ISO 4217 currency codes, not symbols.**
- Use `ETB`, `USD`, `GBP`, `EUR` — not `Br`, `$`, `£`, `€` (symbols are ambiguous).
- Exception: Saudi Riyal uses `SAR` not `﷼`.

### 1.2 Exchange Rates

**MANDATORY: Display rates as received — never calculate.**
- Never compute `receiveAmount / sendAmount` or any rate derivation in UI components.
- The exchange rate string comes from the API / consumer prop and must be rendered verbatim.
- Quote panels must always show the rate as: `1 {sendCurrency} = {rate} {receiveCurrency}`.
- Never display a "mid-market rate" without explicit API-sourced data to back it.

**MANDATORY: Show rate expiry.**
- All exchange rate displays must show the rate's expiry time.
- When < 60 seconds remain: show `StaleDataNotice` with exact remaining time (consumer provides).
- When rate expires: show "Quote expired — refresh to continue." Disable the submit button until a fresh quote is obtained.

**PROHIBITED rate copy:**
- ❌ "Best rate in the market"
- ❌ "Best exchange rate"
- ❌ "We guarantee the best rate"
- ❌ "Better than banks" (unless with verifiable, cited comparison data)
- ❌ "Real-time rate" (unless the rate is genuinely live — latency matters)

### 1.3 Transfer Status

**MANDATORY: Status must always show text + icon — never color alone.**
- A green checkmark with no text is a WCAG 1.4.1 (Use of Color) failure.
- A red X with no text is a WCAG 1.4.1 failure.
- Every status display must include: a visible text label + an icon/indicator.
- `StatusBadge` enforces this by design. Do not bypass it.

**MANDATORY: Submission ≠ Completion.**
- Never show "Transfer sent" at the moment of submission.
- Submission means the request was received. Completion means funds arrived.
- Correct submitted copy: "Transfer submitted — we're processing your transfer."
- Correct processing copy: "Your transfer is being processed."
- Correct completed copy: "Transfer complete — [recipient] has received [amount] [currency]."

**MANDATORY: Always show a transfer reference ID.**
- Any status screen (submitted, processing, completed, failed, etc.) must show a visible transfer ID or reference number.
- This reference must be selectable/copyable so users can quote it to support.
- Never omit the reference on failed or cancelled transfers — it's the primary support identifier.

**MANDATORY: Failed transfers must explain and offer a path forward.**
- Never show "Transfer failed" alone.
- Must include: what failed, what the user should do next, and a support reference.
- Correct: "Transfer failed — [reason if available]. Your funds have not been deducted. [Retry | Contact support]"
- Never say "funds may have been deducted" unless that is factually true per the API response.

### 1.4 Fees

**MANDATORY: Disclose all fees before the user confirms.**
- Fee breakdown must appear on the confirmation screen before the submit button.
- Never hide fees in fine print on the confirmation screen.
- If any fee is zero, display it as "0 [CURRENCY]" — do not omit the line.

**MANDATORY: Fee components must be itemized.**
- Use `FeeBreakdown` to show each fee component with its label and amount.
- Never roll all fees into a single "Total fee" without showing the breakdown.

### 1.5 Balances

**MANDATORY: Distinguish available balance from total balance.**
- If showing a balance, always label it: "Available balance", "Total balance", or "Pending balance".
- Never show an unlabeled number that could be misread as a different balance type.

**MANDATORY: Show stale data warnings.**
- If balance data is older than 5 minutes (consumer's responsibility to track), show `StaleDataNotice`.
- Never silently display outdated balance data.
- Always provide a refresh mechanism when showing stale data.

### 1.6 Recipient Information

**MANDATORY: Mask account numbers.**
- Display account numbers as masked strings: `•••• 4321`.
- The last 4 digits may be shown for identification. Never show the full account number.
- Consumer is responsible for providing the masked string — the component never masks/unmasks.

**MANDATORY: Never store or log unmasked account numbers in UI state.**
- UI components must only hold masked strings. This is a data-handling contract between the consumer and the API — the design system enforces display-side masking only.

---

## 2. Required UI Copy Standards

### Status labels (required text alongside status icons)

| Status | Required label text |
|--------|---------------------|
| neutral | State description (e.g., "Draft", "Unknown") |
| information | Context-specific message |
| submitted | "Transfer submitted" |
| processing | "Processing" |
| completed | "Transfer complete" |
| failed | "Transfer failed" |
| cancelled | "Transfer cancelled" |
| refundPending | "Refund pending" |
| refunded | "Refunded" |
| reversed | "Reversed" |
| stale | "Data may be outdated" |
| offline | "You are offline" |
| unavailable | "[Service name] unavailable" |

### Copy DO/DON'T examples

**Transfer submission:**
- ✅ DO: "Your transfer has been submitted. We'll notify you when it's complete."
- ❌ DON'T: "Transfer sent!" — implies completion when only submission occurred.
- ❌ DON'T: "Money sent!" — misleading; funds have not necessarily arrived.

**Exchange rate:**
- ✅ DO: "1 USD = 56.45 ETB · Rate valid for 4:32"
- ❌ DON'T: "Great rate: 1 USD = 56.45 ETB!" — false urgency, unsubstantiated claim.
- ❌ DON'T: "Live rate" without confirming the rate has sub-second refresh.

**Fees:**
- ✅ DO: "Transfer fee: 2.99 USD · No hidden fees"
- ❌ DON'T: "Low fees!" without showing the actual amount.
- ❌ DON'T: "No fees" if there are fees embedded in the rate spread.

**Balance:**
- ✅ DO: "Available balance · Updated 2 min ago"
- ❌ DON'T: An unlabeled number that could mean anything.

**Failure:**
- ✅ DO: "Transfer failed — please try again. If the issue persists, contact support with reference: TXN-123456."
- ❌ DON'T: "Oops! Something went wrong." — vague, unhelpful, no recovery path.
- ❌ DON'T: "Error code: 500" alone — technical error codes are not user-facing copy.

**Offline:**
- ✅ DO: "You're offline — check your connection and try again."
- ❌ DON'T: A spinner that never resolves with no explanation.

---

## 3. Prohibited Copy Patterns

The following copy patterns are prohibited in all Samra Pay UI:

| Pattern | Reason |
|---------|--------|
| "Best rate in the market" | Unsubstantiated superlative — prohibited without verifiable data source |
| "Zero fees" / "No fees" | Must be literally true AND disclosed if rate spread is used instead |
| "Instant transfer" | Must match actual delivery time per API response — use API-provided estimate |
| "Guaranteed delivery" | Prohibited unless contractually backed and legally reviewed |
| "Your money is safe" | Regulatory language — requires legal review before use |
| "Better than [specific competitor]" | Comparative advertising — requires legal review |
| "Sending..." (indefinitely) | Loading states must have timeout and error handling |
| "Almost done!" | Never predict completion time without certainty |
| "Success!" on submission | Use "Submitted" — success language implies completion |
| Unsupported partner names | Don't claim partnerships with Ethiopian Airlines, ShebaMiles, etc. unless officially contracted |
| Cultural clichés | No "Ethiopian spirit", "land of origins" etc. — speak to the product's actual benefits |

---

## 4. Financial State Machine Rules

UI must reflect the actual transfer state machine:

```
[Draft] → [Submitted] → [Processing] → [Completed]
                     ↘ [Failed]
                     ↘ [Cancelled]
                     ↘ [Refund Pending] → [Refunded]
                     ↘ [Reversed]
```

- Never skip states in the UI — e.g., do not jump from "Submitted" to "Completed" without showing "Processing".
- If the API returns an intermediate state, the UI must reflect it.
- Cancelled and Failed are terminal states — do not show "Processing" after these.
- A "Refund Pending" state must show estimated refund timeline (consumer provides string).
- "Reversed" means the transaction was unwound — different from "Refunded" (which means refund was processed).

---

## 5. Accessibility Requirements for Financial UI

- All financial amounts must have `accessibilityLabel` that reads as: `"[amount] [currency]"` (e.g., "1234.56 ETB").
- Status badges must not rely on color alone — `accessibilityLabel` must state the status in plain language.
- Transfer reference IDs must be selectable/copyable.
- Confirmation screens must not auto-submit — require explicit user action.
- Rate expiry countdowns must use `aria-live="polite"` on web and `accessibilityLiveRegion="polite"` on native.
- Failed state messages must use `role="alert"` / `accessibilityRole="alert"`.
