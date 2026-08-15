import { type ReactNode, useMemo, useState } from "react";
import { ArrowDown, Info } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";

/** Illustrative demo exchange rate: 1 USD = 180 ETB. Not a real quote. */
export const ILLUSTRATIVE_RATE = 180;

export interface QuoteResult {
  amount: number;
  serviceFee: number;
  totalCharged: number;
  recipientEtb: number;
}

/** Deterministic quote math. All money rounds to cents. Illustrative only. */
export function computeQuote(amount: number, feeRate: number, rate = ILLUSTRATIVE_RATE): QuoteResult {
  const safeAmount = Number.isFinite(amount) && amount > 0 ? amount : 0;
  const serviceFee = Math.round(safeAmount * feeRate * 100) / 100;
  return {
    amount: safeAmount,
    serviceFee,
    totalCharged: Math.round((safeAmount + serviceFee) * 100) / 100,
    recipientEtb: Math.round(safeAmount * rate * 100) / 100,
  };
}

function sanitizeUsdInput(raw: string): string {
  let val = raw.replace(/[^\d.]/g, "");
  const firstDot = val.indexOf(".");
  if (firstDot !== -1) {
    val = val.slice(0, firstDot + 1) + val.slice(firstDot + 1).replace(/\./g, "").slice(0, 2);
  }
  return val;
}

function formatMoney(amount: number): string {
  return amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export interface QuotePanelProps {
  /** Controlled "You send" value (string, as typed). Falls back to uncontrolled. */
  amount?: string;
  /** Uncontrolled initial "You send" value. */
  defaultAmount?: string;
  onAmountChange?: (next: string) => void;
  /** Service-fee rate applied to the send amount (e.g. 0.03 for a 3% card fee). */
  feeRate?: number;
  /** Human label for the fee row, e.g. "3% card fee". */
  feeLabel?: string;
  /** Illustrative rate: 1 USD → rate ETB. */
  rate?: number;
  ctaLabel?: string;
  onSubmit?: (quote: QuoteResult) => void;
  className?: string;
  /** Optional slot below the total (e.g. a reward callout). */
  footerSlot?: ReactNode;
}

/**
 * Themed remittance quote / calculator. "You send" USD, "They receive" ETB,
 * a fee row, an illustrative-rate row, and a total, capped with a gold CTA.
 * Controlled-friendly (pass `amount` + `onAmountChange`) or uncontrolled via
 * `defaultAmount`. All surfaces are token-driven; only the figures are demo.
 */
export function QuotePanel({
  amount,
  defaultAmount = "500.00",
  onAmountChange,
  feeRate = 0.03,
  feeLabel = "3% card fee",
  rate = ILLUSTRATIVE_RATE,
  ctaLabel,
  onSubmit,
  className,
  footerSlot,
}: QuotePanelProps) {
  const [internal, setInternal] = useState(defaultAmount);
  const isControlled = amount !== undefined;
  const value = isControlled ? amount : internal;

  const parsed = parseFloat(value || "0") || 0;
  const quote = useMemo(() => computeQuote(parsed, feeRate, rate), [parsed, feeRate, rate]);

  const handleChange = (raw: string) => {
    const next = sanitizeUsdInput(raw);
    if (!isControlled) setInternal(next);
    onAmountChange?.(next);
  };

  return (
    <div
      className={cn(
        "w-full max-w-md rounded-2xl border bg-card text-card-foreground shadow-e2 p-6 space-y-5",
        className,
      )}
    >
      {/* You send */}
      <div className="space-y-2">
        <label htmlFor="quote-you-send" className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          You send
        </label>
        <div className="flex items-center gap-3 rounded-xl border bg-background px-4 py-3 focus-within:ring-2 focus-within:ring-primary/40 transition-shadow duration-standard">
          <span className="text-2xl font-serif text-muted-foreground">$</span>
          <input
            id="quote-you-send"
            inputMode="decimal"
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            aria-label="Amount to send in US dollars"
            className="min-w-0 flex-1 bg-transparent text-3xl font-mono text-foreground outline-none"
          />
          <span className="text-sm font-semibold text-muted-foreground">USD</span>
        </div>
      </div>

      {/* Direction indicator */}
      <div className="flex items-center gap-3" aria-hidden="true">
        <div className="h-px flex-1 pattern-tibeb bg-transparent" style={{ minHeight: "0.5rem" }} />
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-e1">
          <ArrowDown className="h-4 w-4" />
        </span>
        <div className="h-px flex-1 pattern-tibeb bg-transparent" style={{ minHeight: "0.5rem" }} />
      </div>

      {/* They receive */}
      <div className="space-y-2">
        <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">They receive</span>
        <div className="flex items-baseline gap-3 rounded-xl border border-primary/25 bg-accent px-4 py-3">
          <output
            aria-live="polite"
            aria-label="Recipient gets in Ethiopian birr"
            className="min-w-0 flex-1 truncate text-3xl font-mono text-primary"
          >
            {formatMoney(quote.recipientEtb)}
          </output>
          <span className="text-sm font-semibold text-accent-foreground">ETB</span>
        </div>
      </div>

      {/* Breakdown */}
      <div className="space-y-3 border-t pt-4 text-sm">
        <div className="flex items-center justify-between text-muted-foreground">
          <span>Amount to send</span>
          <span className="text-foreground">${formatMoney(quote.amount)}</span>
        </div>
        <div className="flex items-center justify-between text-muted-foreground">
          <span>Service fee ({feeLabel})</span>
          <span className={quote.serviceFee > 0 ? "text-primary" : "text-eucalyptus-foreground"}>
            {quote.serviceFee > 0 ? `$${formatMoney(quote.serviceFee)}` : "Free"}
          </span>
        </div>
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="flex items-center gap-1.5">
            Exchange rate
            <Info className="h-3.5 w-3.5 text-muted-foreground/70" aria-hidden="true" />
          </span>
          <span className="text-foreground">1 USD = {rate} ETB</span>
        </div>
        <p className="text-xs text-muted-foreground/80">
          Illustrative rate for this demo — not a live quote.
        </p>
        <div className="flex items-center justify-between border-t pt-3 text-base font-medium">
          <span>Total charged</span>
          <span className="text-primary">${formatMoney(quote.totalCharged)}</span>
        </div>
      </div>

      {footerSlot}

      <Button
        variant="gold"
        size="lg"
        className="w-full rounded-xl"
        onClick={() => onSubmit?.(quote)}
      >
        {ctaLabel ?? `Continue to send $${formatMoney(quote.totalCharged)}`}
      </Button>
    </div>
  );
}
