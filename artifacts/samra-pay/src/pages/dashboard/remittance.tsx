import { useState } from "react";
import { PageTransition } from "@/components/page-transition";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowDown, History, MapPin, Wallet, CreditCard, Landmark, Smartphone, Check, Plane, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SHEBA_MILES_THRESHOLD,
  SHEBA_MILES_BONUS,
  type DeliveryMethod,
  type PaymentMethod,
  sanitizeUsdInput,
  parseUsd,
  computeQuote,
  formatUsd,
  formatEtb,
} from "@/lib/remittance";

const DEMO_BALANCE = 4250;

const recentTransfers = [
  { id: 1, recipient: "Abebe Bekele", location: "Addis Ababa, ET", date: "Jun 12, 2024", usd: 500, etb: 90000, status: "Completed" },
  { id: 2, recipient: "Tigist Haile", location: "Hawassa, ET", date: "May 28, 2024", usd: 300, etb: 54000, status: "Completed" },
];

export function DashboardRemittance() {
  const [usdAmount, setUsdAmount] = useState<string>("500");
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("bank");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("balance");
  const [plaidLinked, setPlaidLinked] = useState(false);

  const handleUsdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUsdAmount(sanitizeUsdInput(e.target.value));
  };

  const parsedUsdAmount = parseUsd(usdAmount);
  const { serviceFee, totalCharged, recipientEtb, shebaMilesEarned } = computeQuote(
    parsedUsdAmount,
    paymentMethod,
    plaidLinked,
  );
  const etbAmount = formatEtb(recipientEtb);
  const exceedsBalance = paymentMethod === "balance" && totalCharged > DEMO_BALANCE;
  const canContinue = parsedUsdAmount > 0 && !exceedsBalance;

  return (
    <PageTransition>
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-serif">Remittance</h1>
          <p className="text-muted-foreground mt-1">Send money home instantly, at the promo rate.</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          <Card className="bg-card/50 border-white/5 shadow-xl relative overflow-hidden border-primary/20">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-[100px] rounded-full pointer-events-none" />
            <CardHeader>
              <CardTitle>Send Money</CardTitle>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-green-500/30 bg-green-500/10 text-green-400 text-xs font-medium tracking-widest uppercase w-fit mt-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                180 ETB Promo Rate Active
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="bg-background border border-white/5 rounded-2xl p-4 flex flex-col">
                  <label htmlFor="dash-usd-amount" className="text-sm text-muted-foreground mb-2">You send</label>
                  <div className="flex items-center">
                    <span className="text-2xl text-muted-foreground mr-2" aria-hidden="true">$</span>
                    <input 
                      id="dash-usd-amount"
                      type="text"
                      inputMode="decimal"
                      value={usdAmount}
                      onChange={handleUsdChange}
                      className="bg-transparent text-4xl font-mono outline-none w-full text-foreground placeholder:text-muted"
                      placeholder="0.00"
                    />
                    <div className="flex items-center gap-2 bg-secondary/50 px-3 py-1.5 rounded-lg border border-white/5">
                      <span className="font-medium">USD</span>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-2 text-right">Balance: $4,250.00</div>
                </div>

                <div className="flex justify-center -my-2 relative z-10">
                  <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary backdrop-blur-sm shadow-lg">
                    <ArrowDown className="w-5 h-5" />
                  </div>
                </div>

                <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex flex-col">
                  <span className="text-sm text-primary mb-2">Recipient gets</span>
                  <div className="flex items-center">
                    <output
                      aria-live="polite"
                      aria-label="Recipient gets in Ethiopian birr"
                      className="min-w-0 flex-1 truncate bg-transparent text-4xl font-mono text-primary"
                    >
                      {etbAmount}
                    </output>
                    <div className="flex items-center gap-2 bg-primary/20 px-3 py-1.5 rounded-lg border border-primary/30">
                      <span className="font-medium text-primary">ETB</span>
                    </div>
                  </div>
                </div>

                {/* Delivery method */}
                <div>
                  <span id="dash-send-to-label" className="text-xs text-muted-foreground uppercase tracking-widest block mb-3">
                    Send to
                  </span>
                  <div className="grid grid-cols-2 gap-3" role="group" aria-labelledby="dash-send-to-label">
                    {[
                      { id: "wallet" as const, icon: Smartphone, label: "Mobile money wallet", detail: "Telebirr and more" },
                      { id: "bank" as const, icon: Landmark, label: "Bank account", detail: "Direct to their bank" },
                    ].map((method) => {
                      const selected = deliveryMethod === method.id;
                      return (
                        <button
                          key={method.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => setDeliveryMethod(method.id)}
                          className={cn(
                            "relative flex min-h-[96px] flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all",
                            selected
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-white/5 bg-background/50 text-muted-foreground hover:border-white/15 hover:bg-white/[0.03]",
                          )}
                        >
                          {selected && (
                            <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                              <Check className="h-3 w-3" />
                            </span>
                          )}
                          <method.icon className="h-5 w-5" />
                          <span className="text-sm font-medium leading-tight">{method.label}</span>
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            {method.detail}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Payment method */}
                <div>
                  <span id="dash-payment-label" className="text-xs text-muted-foreground uppercase tracking-widest block mb-3">
                    Payment method
                  </span>
                  <div className="grid grid-cols-2 gap-3" role="group" aria-labelledby="dash-payment-label">
                    {[
                      { id: "balance" as const, icon: Wallet, label: "Samra balance", detail: "No service fee" },
                      { id: "card" as const, icon: CreditCard, label: "Card", detail: "3% service fee" },
                      { id: "plaid" as const, icon: Landmark, label: "ACH via Plaid", detail: plaidLinked ? "Free when linked" : "1% ACH · Free with Plaid" },
                    ].map((method) => {
                      const selected = paymentMethod === method.id;
                      return (
                        <button
                          key={method.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => setPaymentMethod(method.id)}
                          className={cn(
                            "relative flex min-h-[96px] flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all",
                            method.id === "plaid" && "col-span-2 sm:col-span-1",
                            selected
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-white/5 bg-background/50 text-muted-foreground hover:border-white/15 hover:bg-white/[0.03]",
                          )}
                        >
                          {selected && (
                            <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                              <Check className="h-3 w-3" />
                            </span>
                          )}
                          <method.icon className="h-5 w-5" />
                          <span className="text-sm font-medium leading-tight">{method.label}</span>
                          <span className={cn(
                            "text-[10px] uppercase tracking-wider",
                            method.id === "card" ? "text-primary/80" : "text-green-400/80",
                          )}>
                            {method.detail}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {paymentMethod === "plaid" && (
                    <button
                      type="button"
                      onClick={() => setPlaidLinked(true)}
                      disabled={plaidLinked}
                      className={cn(
                        "mt-3 flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors",
                        plaidLinked
                          ? "border-green-500/20 bg-green-500/5 text-green-400"
                          : "border-primary/20 bg-primary/5 text-primary hover:border-primary/40",
                      )}
                    >
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <Link2 className="h-4 w-4" aria-hidden="true" />
                        {plaidLinked ? "Bank linked with Plaid" : "Link your bank with Plaid"}
                      </span>
                      <span className="text-xs uppercase tracking-wider">
                        {plaidLinked ? "Fee waived" : "Waive 1% ACH fee"}
                      </span>
                    </button>
                  )}
                </div>

                {/* Quote breakdown */}
                <div className="space-y-3 border-t border-white/10 pt-5 text-sm">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Amount to send</span>
                    <span className="text-foreground">${formatUsd(parsedUsdAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>
                      Service fee{" "}
                      {paymentMethod === "card"
                        ? "(3% card fee)"
                        : paymentMethod === "plaid"
                          ? plaidLinked
                            ? "(Plaid-linked ACH)"
                            : "(1% ACH fee)"
                          : "(Samra balance)"}
                    </span>
                    <span className={serviceFee > 0 ? "text-primary" : "text-green-400"}>
                      {serviceFee > 0 ? `$${formatUsd(serviceFee)}` : "Free"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-white/5 pt-3 text-base font-medium">
                    <span>Total charged</span>
                    <span className="text-primary">${formatUsd(totalCharged)}</span>
                  </div>
                </div>

                {/* Sheba Miles reward */}
                <div
                  role="status"
                  aria-live="polite"
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-4 py-3",
                    shebaMilesEarned > 0
                      ? "border-primary/30 bg-primary/10"
                      : "border-white/10 bg-background/40",
                  )}
                >
                  <div className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                    shebaMilesEarned > 0
                      ? "bg-primary/20 text-primary"
                      : "bg-white/5 text-muted-foreground",
                  )}>
                    <Plane className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <div className={cn("font-medium", shebaMilesEarned > 0 ? "text-primary" : "text-foreground")}>
                      {shebaMilesEarned > 0
                        ? `+${SHEBA_MILES_BONUS} Sheba Miles`
                        : `Send over $${SHEBA_MILES_THRESHOLD} to earn ${SHEBA_MILES_BONUS} Sheba Miles`}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Illustrative demo reward
                    </div>
                  </div>
                </div>

                {exceedsBalance && (
                  <p role="alert" className="text-sm text-red-400">
                    This amount exceeds your ${formatUsd(DEMO_BALANCE)} Samra balance. Lower the amount or choose another payment method.
                  </p>
                )}

                <Button variant="gold" size="lg" className="w-full rounded-xl text-lg h-14 mt-2" disabled={!canContinue}>
                  Continue to send ${formatUsd(totalCharged)}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-white/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5 text-muted-foreground" />
                Recent Transfers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentTransfers.map((t) => (
                  <div key={t.id} className="p-4 rounded-xl border border-white/5 bg-background/50 flex flex-col gap-3">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center font-medium">
                          {t.recipient.charAt(0)}
                        </div>
                        <div>
                          <div className="font-medium">{t.recipient}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {t.location}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-primary">{t.etb.toLocaleString()} ETB</div>
                        <div className="text-xs text-muted-foreground">Sent ${t.usd}</div>
                      </div>
                    </div>
                    <div className="flex justify-between items-center pt-3 border-t border-white/5 text-xs text-muted-foreground">
                      <span>{t.date}</span>
                      <span className="text-green-400 font-medium">{t.status}</span>
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="outline" className="w-full mt-6 border-white/5">View All History</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageTransition>
  );
}
