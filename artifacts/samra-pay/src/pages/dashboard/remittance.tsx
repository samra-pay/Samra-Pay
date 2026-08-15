import { useState, useEffect } from "react";
import { PageTransition } from "@/components/page-transition";
import imgCbeBirr   from "@/assets/wallets/cbebirr.png";
import imgAmole     from "@/assets/wallets/amole.png";
import imgHellocash from "@/assets/wallets/hellocash.jpg";
import imgMbirr     from "@/assets/wallets/mbirr.png";
import imgKacha     from "@/assets/wallets/kacha.png";
import imgAwashBirr from "@/assets/wallets/awashbirr.png";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowDown, ArrowLeft, History, MapPin, Wallet, CreditCard,
  Landmark, Smartphone, Check, Plane, Link2, CircleCheck,
  Pencil, Trash2, RotateCcw, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PROMO_RATE,
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
import { popRestoredQuote } from "@/lib/remittance-handoff";
import {
  loadTransfers,
  saveTransfers,
  type PersistedTransfer,
} from "@/lib/transfer-storage";

// ─── Ethiopian data ───────────────────────────────────────────────────────────

const ETHIOPIAN_BANKS = [
  { id: "cbe",      name: "Commercial Bank of Ethiopia",    short: "CBE" },
  { id: "awash",    name: "Awash Bank",                     short: "Awash" },
  { id: "dashen",   name: "Dashen Bank",                    short: "Dashen" },
  { id: "abyssinia",name: "Bank of Abyssinia",              short: "BoA" },
  { id: "coopbank", name: "Cooperative Bank of Oromia",     short: "Coopbank" },
  { id: "nib",      name: "Nib International Bank",         short: "NIB" },
  { id: "wegagen",  name: "Wegagen Bank",                   short: "Wegagen" },
  { id: "hibret",   name: "United Bank (Hibret)",           short: "Hibret" },
  { id: "berhan",   name: "Berhan Bank",                    short: "Berhan" },
  { id: "bunna",    name: "Bunna International Bank",       short: "Bunna" },
  { id: "abay",     name: "Abay Bank",                      short: "Abay" },
  { id: "addis",    name: "Addis International Bank",       short: "AIB" },
  { id: "enat",     name: "Enat Bank",                      short: "Enat" },
  { id: "debub",    name: "Debub Global Bank",              short: "DGB" },
  { id: "tsedey",   name: "Tsedey Bank",                    short: "Tsedey" },
  { id: "gadaa",    name: "Gadaa Bank",                     short: "Gadaa" },
  { id: "siinqee",  name: "Siinqee Bank",                   short: "Siinqee" },
  { id: "zamzam",   name: "ZamZam Bank",                    short: "ZamZam" },
  { id: "amhara",   name: "Amhara Bank",                    short: "Amhara" },
  { id: "ahadu",    name: "Ahadu Bank",                     short: "Ahadu" },
  { id: "oromia",   name: "Oromia Bank",                    short: "OB" },
];

const ETHIOPIAN_WALLETS = [
  {
    id: "telebirr",
    name: "Telebirr",
    owner: "Ethio Telecom",
    color: "from-sky-700/20 to-sky-900/10",
    border: "border-sky-500/30",
    img: null,
    fallback: "TE",
    fallbackColor: "bg-sky-600",
  },
  {
    id: "cbebirr",
    name: "CBE Birr",
    owner: "Commercial Bank of Ethiopia",
    color: "from-yellow-700/20 to-yellow-900/10",
    border: "border-yellow-500/30",
    img: imgCbeBirr,
    fallback: "CB",
    fallbackColor: "bg-yellow-700",
  },
  {
    id: "amole",
    name: "Amole",
    owner: "Dashen Bank",
    color: "from-blue-700/20 to-blue-900/10",
    border: "border-blue-500/30",
    img: imgAmole,
    fallback: "AM",
    fallbackColor: "bg-blue-700",
  },
  {
    id: "hellocash",
    name: "HelloCash",
    owner: "HelloCash Ethiopia",
    color: "from-orange-700/20 to-orange-900/10",
    border: "border-orange-500/30",
    img: imgHellocash,
    fallback: "HC",
    fallbackColor: "bg-orange-600",
  },
  {
    id: "mbirr",
    name: "M-Birr",
    owner: "Mobile Commerce Ethiopia",
    color: "from-green-700/20 to-green-900/10",
    border: "border-green-500/30",
    img: imgMbirr,
    fallback: "MB",
    fallbackColor: "bg-green-700",
  },
  {
    id: "kacha",
    name: "Kacha",
    owner: "Kacha Digital Financial Services",
    color: "from-amber-700/20 to-amber-900/10",
    border: "border-amber-500/30",
    img: imgKacha,
    fallback: "KA",
    fallbackColor: "bg-amber-600",
  },
  {
    id: "awashbirr",
    name: "Awash Birr",
    owner: "Awash Bank",
    color: "from-orange-600/20 to-blue-900/10",
    border: "border-orange-400/30",
    img: imgAwashBirr,
    fallback: "AB",
    fallbackColor: "bg-orange-600",
  },
  {
    id: "payway",
    name: "PayWay",
    owner: "PayWay Ethiopia",
    color: "from-teal-700/20 to-teal-900/10",
    border: "border-teal-500/30",
    img: null,
    fallback: "PW",
    fallbackColor: "bg-teal-700",
  },
];

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = "quote" | "recipient" | "confirm" | "success";

// Re-export the shared type so the rest of the file can use a short alias
type Transfer = PersistedTransfer;

/** Address-book entry — separate from Transfer so edits/deletes never touch history. */
interface AddressBookEntry {
  id: number;
  name: string;
  location: string;
  // Delivery details for pre-fill (mirrors the last transfer to this recipient)
  deliveryMethod?: DeliveryMethod;
  bankId?: string;
  accountNumber?: string;
  walletId?: string;
  phoneNumber?: string;
}

function todayLabel(): string {
  return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const INITIAL_TRANSFERS: Transfer[] = [
  { id: 1, recipient: "Abebe Bekele", location: "Addis Ababa, ET", date: "Jun 12, 2024", usd: 500, etb: 90000, status: "Completed", deliveryMethod: "bank", bankId: "cbe", accountNumber: "10000123456789" },
  { id: 2, recipient: "Tigist Haile",  location: "Hawassa, ET",     date: "May 28, 2024", usd: 300, etb: 54000, status: "Completed", deliveryMethod: "bank", bankId: "awash", accountNumber: "20000987654321" },
];

const DEMO_BALANCE_INITIAL = 4250;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sanitizePhone(val: string) {
  return val.replace(/[^\d+\s\-()]/g, "").slice(0, 20);
}

function sanitizeAccount(val: string) {
  return val.replace(/[^\d]/g, "").slice(0, 20);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DashboardRemittance() {
  // Step
  const [step, setStep] = useState<Step>("quote");

  // Quote state
  const [usdAmount, setUsdAmount]           = useState<string>("500");
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("bank");
  const [paymentMethod, setPaymentMethod]   = useState<PaymentMethod>("balance");
  const [plaidLinked, setPlaidLinked]       = useState(false);

  // On mount: restore a quote started on the public remittance page and jump to Step 2
  useEffect(() => {
    const q = popRestoredQuote();
    if (!q) return;
    if (q.usdAmount)      setUsdAmount(q.usdAmount);
    if (q.deliveryMethod) setDeliveryMethod(q.deliveryMethod);
    if (q.paymentMethod)  setPaymentMethod(q.paymentMethod);
    if (q.plaidLinked)    setPlaidLinked(q.plaidLinked);
    setStep("recipient");
  }, []);

  // Recipient state (bank)
  const [bankId, setBankId]               = useState<string>("");
  const [accountNumber, setAccountNumber] = useState<string>("");

  // Recipient state (wallet)
  const [walletId, setWalletId]   = useState<string>("");
  const [phoneNumber, setPhone]   = useState<string>("");

  // Shared recipient
  const [recipientName, setRecipientName]         = useState<string>("");
  const [recipientLocation, setRecipientLocation] = useState<string>("");
  // null = "new recipient" mode; a number = id of the selected address-book entry
  const [savedRecipientId, setSavedRecipientId]   = useState<number | null>(null);

  // ── Address book (separate from immutable transfer history) ─────────────────
  const [addressBook, setAddressBook] = useState<AddressBookEntry[]>(() =>
    loadTransfers(INITIAL_TRANSFERS).reduce<AddressBookEntry[]>((acc, t) => {
      if (!acc.some(e => e.name === t.recipient))
        acc.push({
          id: t.id,
          name: t.recipient,
          location: t.location,
          deliveryMethod: t.deliveryMethod,
          bankId: t.bankId,
          accountNumber: t.accountNumber,
          walletId: t.walletId,
          phoneNumber: t.phoneNumber,
        });
      return acc;
    }, []),
  );

  // ── Address book: inline edit state (tracked by ID, not name) ──────────────
  const [editingId, setEditingId]         = useState<number | null>(null);
  const [editDraftName, setEditDraftName] = useState<string>("");
  const [editDraftLoc, setEditDraftLoc]   = useState<string>("");

  // ── Address book: delete-with-undo buffer ──────────────────────────────────
  const [undoBuffer, setUndoBuffer] = useState<{ entry: AddressBookEntry } | null>(null);

  // Demo balance (deducted on confirm when paying from balance)
  const [demoBalance, setDemoBalance] = useState<number>(DEMO_BALANCE_INITIAL);

  // Transfer history — persisted to localStorage so saved recipients survive page refresh
  const [transfers, setTransfers] = useState<Transfer[]>(() =>
    loadTransfers(INITIAL_TRANSFERS),
  );

  useEffect(() => {
    saveTransfers(transfers);
  }, [transfers]);

  // ── Quote math ──────────────────────────────────────────────────────────────
  const parsedUsdAmount = parseUsd(usdAmount);
  const { serviceFee, totalCharged, recipientEtb, shebaMilesEarned } = computeQuote(
    parsedUsdAmount, paymentMethod, plaidLinked,
  );
  const etbDisplay = formatEtb(recipientEtb);
  const exceedsBalance = paymentMethod === "balance" && totalCharged > demoBalance;
  const canContinue = parsedUsdAmount > 0 && !exceedsBalance;

  // ── Recipient step validation ───────────────────────────────────────────────
  const recipientValid   = recipientName.trim().length > 1;
  const locationValid    = recipientLocation.trim().length > 0;
  const bankValid        = deliveryMethod === "bank"   && !!bankId && accountNumber.length >= 8;
  const walletValid      = deliveryMethod === "wallet" && !!walletId && phoneNumber.replace(/\D/g, "").length >= 9;
  const canConfirm       = recipientValid && locationValid && (deliveryMethod === "bank" ? bankValid : walletValid);

  // ── Derived display labels ──────────────────────────────────────────────────
  const selectedBank   = ETHIOPIAN_BANKS.find(b => b.id === bankId);
  const selectedWallet = ETHIOPIAN_WALLETS.find(w => w.id === walletId);

  // ── Confirm → success ───────────────────────────────────────────────────────
  function handleConfirm() {
    const today = todayLabel();
    const newTransfer: Transfer = {
      id: Date.now(),
      recipient: recipientName.trim(),
      location: recipientLocation.trim() || "Ethiopia",
      date: today,
      usd: parsedUsdAmount,
      etb: recipientEtb,
      status: "Completed",
      // persist delivery details so the form can be pre-filled on re-use
      deliveryMethod,
      ...(deliveryMethod === "bank"
        ? { bankId, accountNumber }
        : { walletId, phoneNumber }),
    };
    setTransfers(prev => [newTransfer, ...prev]);
    // Add to address book only if this name isn't already saved
    const trimmedName = recipientName.trim();
    setAddressBook(prev =>
      prev.some(e => e.name === trimmedName)
        ? prev
        : [{
            id: newTransfer.id,
            name: trimmedName,
            location: newTransfer.location,
            deliveryMethod: newTransfer.deliveryMethod,
            bankId: newTransfer.bankId,
            accountNumber: newTransfer.accountNumber,
            walletId: newTransfer.walletId,
            phoneNumber: newTransfer.phoneNumber,
          }, ...prev],
    );
    if (paymentMethod === "balance") {
      setDemoBalance(b => Math.round((b - totalCharged) * 100) / 100);
    }
    setStep("success");
  }

  function handleReset() {
    setStep("quote");
    setUsdAmount("500");
    setDeliveryMethod("bank");
    setPaymentMethod("balance");
    setPlaidLinked(false);
    setBankId("");
    setAccountNumber("");
    setWalletId("");
    setPhone("");
    setRecipientName("");
    setRecipientLocation("");
    setSavedRecipientId(null);
  }

  // ── Address book helpers ────────────────────────────────────────────────────
  function startEdit(entry: AddressBookEntry) {
    setEditingId(entry.id);
    setEditDraftName(entry.name);
    setEditDraftLoc(entry.location);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  function saveEdit() {
    if (editingId === null) return;
    const newName = editDraftName.trim();
    const newLoc  = editDraftLoc.trim();
    // Update only the address book — transfer history is immutable
    setAddressBook(prev => prev.map(e =>
      e.id === editingId ? { ...e, name: newName, location: newLoc } : e,
    ));
    // Keep the form fields in sync if this entry was selected
    if (savedRecipientId === editingId) {
      setRecipientName(newName);
      setRecipientLocation(newLoc);
    }
    setEditingId(null);
  }

  function deleteRecipient(entry: AddressBookEntry) {
    setAddressBook(prev => prev.filter(e => e.id !== entry.id));
    // Deselect if the deleted entry was chosen
    if (savedRecipientId === entry.id) {
      setSavedRecipientId(null);
      setRecipientName("");
      setRecipientLocation("");
    }
    setUndoBuffer({ entry });
    // Auto-dismiss undo after 5 s
    setTimeout(() => setUndoBuffer(b => (b?.entry.id === entry.id ? null : b)), 5000);
  }

  function undoDelete() {
    if (!undoBuffer) return;
    setAddressBook(prev => [undoBuffer.entry, ...prev]);
    setUndoBuffer(null);
  }

  // addressBook is the source of truth for the picker; transfers are immutable history

  // ── Payment method fee label ────────────────────────────────────────────────
  const feeLabel = paymentMethod === "card"
    ? "(3% card fee)"
    : paymentMethod === "plaid"
      ? plaidLinked ? "(Plaid-linked ACH)" : "(1% ACH fee)"
      : "(Samra balance)";

  // ══════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════════
  return (
    <PageTransition>
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-serif">Remittance</h1>
          <p className="text-muted-foreground mt-1">Send money home instantly, at the promo rate.</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 items-start">

          {/* ── Left card: wizard steps ────────────────────────────────────── */}
          <Card className="bg-card/50 border-white/5 shadow-xl relative overflow-hidden border-primary/20">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-[100px] rounded-full pointer-events-none" />

            {/* Step indicator */}
            {step !== "success" && (
              <div className="px-6 pt-6 pb-0 flex items-center gap-2">
                {(["quote", "recipient", "confirm"] as Step[]).map((s, i) => (
                  <div key={s} className="flex items-center gap-2">
                    <div className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors",
                      step === s
                        ? "bg-primary text-primary-foreground"
                        : (["quote","recipient","confirm"].indexOf(step) > i)
                          ? "bg-primary/30 text-primary"
                          : "bg-white/10 text-muted-foreground",
                    )}>
                      {(["quote","recipient","confirm"].indexOf(step) > i)
                        ? <Check className="w-3 h-3" />
                        : i + 1}
                    </div>
                    {i < 2 && <div className={cn("h-px w-6 transition-colors", (["quote","recipient","confirm"].indexOf(step) > i) ? "bg-primary/40" : "bg-white/10")} />}
                  </div>
                ))}
                <span className="ml-2 text-xs text-muted-foreground capitalize">
                  {step === "quote" ? "Quote" : step === "recipient" ? "Recipient" : "Review"}
                </span>
              </div>
            )}

            {/* ── STEP 1: QUOTE ────────────────────────────────────────────── */}
            {step === "quote" && (
              <>
                <CardHeader>
                  <CardTitle>Send Money</CardTitle>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-green-500/30 bg-green-500/10 text-green-400 text-xs font-medium tracking-widest uppercase w-fit mt-2">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    180 ETB Promo Rate Active
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {/* USD input */}
                    <div className="bg-background border border-white/5 rounded-2xl p-4 flex flex-col">
                      <label htmlFor="dash-usd-amount" className="text-sm text-muted-foreground mb-2">You send</label>
                      <div className="flex items-center">
                        <span className="text-2xl text-muted-foreground mr-2" aria-hidden="true">$</span>
                        <input
                          id="dash-usd-amount"
                          type="text"
                          inputMode="decimal"
                          value={usdAmount}
                          onChange={e => setUsdAmount(sanitizeUsdInput(e.target.value))}
                          className="bg-transparent text-4xl font-mono outline-none w-full text-foreground placeholder:text-muted"
                          placeholder="0.00"
                        />
                        <div className="flex items-center gap-2 bg-secondary/50 px-3 py-1.5 rounded-lg border border-white/5">
                          <span className="font-medium">USD</span>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground mt-2 text-right">
                        Balance: ${formatUsd(demoBalance)} <span className="opacity-60">(illustrative)</span>
                      </div>
                    </div>

                    <div className="flex justify-center -my-2 relative z-10">
                      <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary backdrop-blur-sm shadow-lg">
                        <ArrowDown className="w-5 h-5" />
                      </div>
                    </div>

                    {/* ETB output */}
                    <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex flex-col">
                      <span className="text-sm text-primary mb-2">Recipient gets</span>
                      <div className="flex items-center">
                        <output
                          aria-live="polite"
                          aria-label="Recipient gets in Ethiopian birr"
                          className="min-w-0 flex-1 truncate bg-transparent text-4xl font-mono text-primary"
                        >
                          {etbDisplay}
                        </output>
                        <div className="flex items-center gap-2 bg-primary/20 px-3 py-1.5 rounded-lg border border-primary/30">
                          <span className="font-medium text-primary">ETB</span>
                        </div>
                      </div>
                    </div>

                    {/* Delivery method */}
                    <div>
                      <span id="dash-send-to-label" className="text-xs text-muted-foreground uppercase tracking-widest block mb-3">Send to</span>
                      <div className="grid grid-cols-2 gap-3" role="group" aria-labelledby="dash-send-to-label">
                        {([
                          { id: "wallet" as const, icon: Smartphone, label: "Mobile money wallet", detail: "Telebirr and more" },
                          { id: "bank"   as const, icon: Landmark,   label: "Bank account",        detail: "Direct to their bank" },
                        ] as const).map((m) => {
                          const sel = deliveryMethod === m.id;
                          return (
                            <button key={m.id} type="button" aria-pressed={sel}
                              onClick={() => setDeliveryMethod(m.id)}
                              className={cn("relative flex min-h-[96px] flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all",
                                sel ? "border-primary bg-primary/10 text-primary" : "border-white/5 bg-background/50 text-muted-foreground hover:border-white/15 hover:bg-white/[0.03]",
                              )}
                            >
                              {sel && <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="h-3 w-3" /></span>}
                              <m.icon className="h-5 w-5" />
                              <span className="text-sm font-medium leading-tight">{m.label}</span>
                              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{m.detail}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Payment method */}
                    <div>
                      <span id="dash-payment-label" className="text-xs text-muted-foreground uppercase tracking-widest block mb-3">Payment method</span>
                      <div className="grid grid-cols-2 gap-3" role="group" aria-labelledby="dash-payment-label">
                        {([
                          { id: "balance" as const, icon: Wallet,     label: "Samra balance",   detail: "No service fee",   feeColor: "text-green-400/80" },
                          { id: "card"    as const, icon: CreditCard,  label: "Card",             detail: "3% service fee",   feeColor: "text-primary/80" },
                          { id: "plaid"   as const, icon: Landmark,    label: "ACH via Plaid",   detail: plaidLinked ? "Free when linked" : "1% ACH · Free with Plaid", feeColor: "text-green-400/80" },
                        ] as const).map((m) => {
                          const sel = paymentMethod === m.id;
                          return (
                            <button key={m.id} type="button" aria-pressed={sel}
                              onClick={() => setPaymentMethod(m.id)}
                              className={cn("relative flex min-h-[96px] flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all",
                                m.id === "plaid" && "col-span-2 sm:col-span-1",
                                sel ? "border-primary bg-primary/10 text-primary" : "border-white/5 bg-background/50 text-muted-foreground hover:border-white/15 hover:bg-white/[0.03]",
                              )}
                            >
                              {sel && <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="h-3 w-3" /></span>}
                              <m.icon className="h-5 w-5" />
                              <span className="text-sm font-medium leading-tight">{m.label}</span>
                              <span className={cn("text-[10px] uppercase tracking-wider", m.feeColor)}>{m.detail}</span>
                            </button>
                          );
                        })}
                      </div>

                      {paymentMethod === "plaid" && (
                        <button type="button" onClick={() => setPlaidLinked(true)} disabled={plaidLinked}
                          className={cn("mt-3 flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors",
                            plaidLinked ? "border-green-500/20 bg-green-500/5 text-green-400" : "border-primary/20 bg-primary/5 text-primary hover:border-primary/40",
                          )}
                        >
                          <span className="flex items-center gap-2 text-sm font-medium">
                            <Link2 className="h-4 w-4" aria-hidden="true" />
                            {plaidLinked ? "Bank linked with Plaid" : "Link your bank with Plaid"}
                          </span>
                          <span className="text-xs uppercase tracking-wider">{plaidLinked ? "Fee waived" : "Waive 1% ACH fee"}</span>
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
                        <span>Service fee {feeLabel}</span>
                        <span className={serviceFee > 0 ? "text-foreground" : "text-green-400"}>
                          {serviceFee > 0 ? `$${formatUsd(serviceFee)}` : "Free"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-t border-white/5 pt-3 text-base font-semibold">
                        <span>Total charged</span>
                        <span className="text-foreground">${formatUsd(totalCharged)}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-xl bg-primary/10 border border-primary/25 px-4 py-3 text-base font-semibold">
                        <span className="text-primary">Funds received</span>
                        <span className="text-primary font-mono">{etbDisplay} ETB</span>
                      </div>
                    </div>

                    {/* Sheba Miles */}
                    <div role="status" aria-live="polite" className={cn("flex items-center gap-3 rounded-xl border px-4 py-3",
                      shebaMilesEarned > 0 ? "border-primary/30 bg-primary/10" : "border-white/10 bg-background/40",
                    )}>
                      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", shebaMilesEarned > 0 ? "bg-primary/20 text-primary" : "bg-white/5 text-muted-foreground")}>
                        <Plane className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <div className={cn("font-medium", shebaMilesEarned > 0 ? "text-primary" : "text-foreground")}>
                          {shebaMilesEarned > 0 ? `+${SHEBA_MILES_BONUS} Sheba Miles` : `Send over $${SHEBA_MILES_THRESHOLD} to earn ${SHEBA_MILES_BONUS} Sheba Miles`}
                        </div>
                        <div className="text-xs text-muted-foreground">Illustrative demo reward</div>
                      </div>
                    </div>

                    {exceedsBalance && (
                      <p role="alert" className="text-sm text-red-400">
                        This amount exceeds your ${formatUsd(demoBalance)} Samra balance. Lower the amount or choose another payment method.
                      </p>
                    )}

                    <Button variant="gold" size="lg" className="w-full rounded-xl text-lg h-14 mt-2"
                      disabled={!canContinue} onClick={() => setStep("recipient")}
                    >
                      Continue to send ${formatUsd(totalCharged)}
                    </Button>
                  </div>
                </CardContent>
              </>
            )}

            {/* ── STEP 2: RECIPIENT ─────────────────────────────────────────── */}
            {step === "recipient" && (
              <>
                <CardHeader>
                  <button type="button" onClick={() => setStep("quote")}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-1 -ml-1"
                  >
                    <ArrowLeft className="h-4 w-4" /> Back
                  </button>
                  <CardTitle>
                    {deliveryMethod === "bank" ? "Recipient bank details" : "Recipient wallet details"}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Sending <span className="text-foreground font-medium">${formatUsd(parsedUsdAmount)}</span> → <span className="text-primary font-medium">{formatEtb(recipientEtb)} ETB</span>
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-5">

                    {/* ── Saved recipients picker ──────────────────────────── */}

                    {/* Undo-delete toast — outside the address-book guard so it
                        shows even after the last entry is removed */}
                    {undoBuffer && (
                      <div className="flex items-center justify-between rounded-xl border border-white/10 bg-background/80 px-4 py-2.5 text-sm">
                        <span className="text-muted-foreground">
                          <span className="text-foreground font-medium">{undoBuffer.entry.name}</span> removed
                        </span>
                        <button
                          type="button"
                          onClick={undoDelete}
                          className="flex items-center gap-1.5 text-primary hover:text-primary/80 font-medium transition-colors ml-4 shrink-0"
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Undo
                        </button>
                      </div>
                    )}

                    {addressBook.length > 0 && (
                      <div>
                        <span className="text-xs text-muted-foreground uppercase tracking-widest block mb-3">Past recipients</span>
                        <div className="space-y-2">
                          {addressBook.map(r => {
                            const sel       = savedRecipientId === r.id;
                            const isEditing = editingId === r.id;

                            if (isEditing) {
                              /* ── Inline edit mode ── */
                              return (
                                <div
                                  key={r.id}
                                  className="rounded-xl border border-primary/40 bg-primary/5 px-4 py-3 space-y-3"
                                >
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs text-primary font-medium uppercase tracking-wider">Edit recipient</span>
                                    <button
                                      type="button"
                                      onClick={cancelEdit}
                                      className="text-muted-foreground hover:text-foreground transition-colors"
                                      aria-label="Cancel edit"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
                                  <div>
                                    <label className="text-xs text-muted-foreground block mb-1">Full name</label>
                                    <input
                                      type="text"
                                      value={editDraftName}
                                      onChange={e => setEditDraftName(e.target.value)}
                                      className="w-full bg-background/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 transition-colors"
                                      autoFocus
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs text-muted-foreground block mb-1">City / location</label>
                                    <input
                                      type="text"
                                      value={editDraftLoc}
                                      onChange={e => setEditDraftLoc(e.target.value)}
                                      className="w-full bg-background/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 transition-colors"
                                    />
                                  </div>
                                  <div className="flex gap-2 pt-1">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="gold"
                                      className="flex-1 rounded-lg h-8 text-xs"
                                      disabled={editDraftName.trim().length < 2 || editDraftLoc.trim().length === 0}
                                      onClick={saveEdit}
                                    >
                                      Save changes
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="rounded-lg h-8 text-xs border-white/10"
                                      onClick={cancelEdit}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              );
                            }

                            /* ── Normal card ── */
                            return (
                              <div
                                key={r.id}
                                className={cn(
                                  "w-full flex items-center gap-3 rounded-xl border px-4 py-3 transition-all",
                                  sel
                                    ? "border-primary/40 bg-primary/10 ring-1 ring-primary/20"
                                    : "border-white/10 bg-background/50",
                                )}
                              >
                                {/* Clickable selection area */}
                                <button
                                  type="button"
                                  aria-pressed={sel}
                                  onClick={() => {
                                    if (sel) {
                                      setSavedRecipientId(null);
                                      setRecipientName("");
                                      setRecipientLocation("");
                                    } else {
                                      setSavedRecipientId(r.id);
                                      setRecipientName(r.name);
                                      setRecipientLocation(r.location);
                                      // restore delivery details so the form is valid without re-entry
                                      if (r.deliveryMethod) setDeliveryMethod(r.deliveryMethod);
                                      if (r.bankId)         setBankId(r.bankId);
                                      if (r.accountNumber)  setAccountNumber(r.accountNumber);
                                      if (r.walletId)       setWalletId(r.walletId);
                                      if (r.phoneNumber)    setPhone(r.phoneNumber);
                                    }
                                  }}
                                  className="flex items-center gap-3 min-w-0 flex-1 text-left"
                                >
                                  <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center font-semibold text-sm shrink-0">
                                    {r.name.charAt(0)}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="text-sm font-medium text-foreground truncate">{r.name}</div>
                                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                      <MapPin className="w-3 h-3 shrink-0" />
                                      <span className="truncate">{r.location}</span>
                                    </div>
                                  </div>
                                  {sel && (
                                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shrink-0">
                                      <Check className="h-3 w-3" />
                                    </span>
                                  )}
                                </button>

                                {/* Edit / Delete actions */}
                                <div className="flex items-center gap-1 shrink-0 ml-1">
                                  <button
                                    type="button"
                                    aria-label={`Edit ${r.name}`}
                                    onClick={() => startEdit(r)}
                                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={`Remove ${r.name}`}
                                    onClick={() => deleteRecipient(r)}
                                    className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}

                          {/* New recipient option */}
                          <button
                            type="button"
                            aria-pressed={savedRecipientId === null}
                            onClick={() => {
                              setSavedRecipientId(null);
                              setRecipientName("");
                              setRecipientLocation("");
                            }}
                            className={cn(
                              "w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all",
                              savedRecipientId === null
                                ? "border-primary/40 bg-primary/10 ring-1 ring-primary/20"
                                : "border-white/10 bg-background/50 hover:border-white/20 hover:bg-white/[0.03]",
                            )}
                          >
                            <div className="w-9 h-9 rounded-full border border-dashed border-white/20 bg-white/5 flex items-center justify-center text-muted-foreground text-lg shrink-0">+</div>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium text-foreground">New recipient</div>
                              <div className="text-xs text-muted-foreground">Enter name and location</div>
                            </div>
                            {savedRecipientId === null && (
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shrink-0">
                                <Check className="h-3 w-3" />
                              </span>
                            )}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Recipient name */}
                    <div>
                      <label htmlFor="recipient-name" className="text-xs text-muted-foreground uppercase tracking-widest block mb-2">Recipient full name</label>
                      <input
                        id="recipient-name"
                        type="text"
                        value={recipientName}
                        onChange={e => { setRecipientName(e.target.value); setSavedRecipientId(null); }}
                        placeholder="e.g. Abebe Bekele"
                        className="w-full bg-background/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 transition-colors"
                      />
                    </div>

                    {/* Location */}
                    <div>
                      <label htmlFor="recipient-location" className="text-xs text-muted-foreground uppercase tracking-widest block mb-2">City / location</label>
                      <input
                        id="recipient-location"
                        type="text"
                        value={recipientLocation}
                        onChange={e => setRecipientLocation(e.target.value)}
                        placeholder="e.g. Addis Ababa, ET"
                        className="w-full bg-background/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 transition-colors"
                      />
                    </div>

                    {/* ── BANK branch ─────────────────────────────────────── */}
                    {deliveryMethod === "bank" && (
                      <>
                        <div>
                          <label htmlFor="bank-select" className="text-xs text-muted-foreground uppercase tracking-widest block mb-2">Select bank</label>
                          <div className="relative">
                            <select
                              id="bank-select"
                              value={bankId}
                              onChange={e => setBankId(e.target.value)}
                              className="w-full bg-background/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-foreground outline-none focus:border-primary/50 transition-colors appearance-none pr-10 cursor-pointer"
                            >
                              <option value="" disabled>Choose a bank…</option>
                              {ETHIOPIAN_BANKS.map(b => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                              ))}
                            </select>
                            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">▾</span>
                          </div>
                          {selectedBank && (
                            <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20">
                              <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                                <Landmark className="w-3 h-3 text-primary" />
                              </div>
                              <span className="text-xs text-primary">{selectedBank.name} ({selectedBank.short})</span>
                            </div>
                          )}
                        </div>

                        <div>
                          <label htmlFor="account-number" className="text-xs text-muted-foreground uppercase tracking-widest block mb-2">Account number</label>
                          <input
                            id="account-number"
                            type="text"
                            inputMode="numeric"
                            value={accountNumber}
                            onChange={e => setAccountNumber(sanitizeAccount(e.target.value))}
                            placeholder="e.g. 10000123456789"
                            className="w-full bg-background/60 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 transition-colors"
                          />
                          <p className="text-xs text-muted-foreground mt-1">Digits only · 8–20 digits</p>
                        </div>
                      </>
                    )}

                    {/* ── WALLET branch ────────────────────────────────────── */}
                    {deliveryMethod === "wallet" && (
                      <>
                        <div>
                          <span className="text-xs text-muted-foreground uppercase tracking-widest block mb-3">Select mobile wallet</span>
                          <div className="grid grid-cols-2 gap-3">
                            {ETHIOPIAN_WALLETS.map(w => {
                              const sel = walletId === w.id;
                              return (
                                <button key={w.id} type="button" aria-pressed={sel}
                                  onClick={() => setWalletId(w.id)}
                                  className={cn(
                                    "relative flex flex-col items-start gap-2.5 rounded-xl border p-4 text-left transition-all",
                                    `bg-gradient-to-br ${w.color}`,
                                    sel ? `${w.border} ring-1 ring-primary/40` : "border-white/5 hover:border-white/15",
                                  )}
                                >
                                  {sel && <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="h-3 w-3" /></span>}
                                  <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center bg-white/10">
                                    {w.img
                                      ? <img src={w.img} alt={`${w.name} logo`} className="w-full h-full object-contain" />
                                      : <span className={cn("w-full h-full flex items-center justify-center text-xs font-bold text-white rounded-xl", w.fallbackColor)}>{w.fallback}</span>
                                    }
                                  </div>
                                  <div>
                                    <div className="text-sm font-semibold text-foreground leading-tight">{w.name}</div>
                                    <div className="text-[10px] text-muted-foreground mt-0.5">{w.owner}</div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div>
                          <label htmlFor="wallet-phone" className="text-xs text-muted-foreground uppercase tracking-widest block mb-2">Recipient phone number</label>
                          <input
                            id="wallet-phone"
                            type="tel"
                            value={phoneNumber}
                            onChange={e => setPhone(sanitizePhone(e.target.value))}
                            placeholder="e.g. +251 91 234 5678"
                            className="w-full bg-background/60 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 transition-colors"
                          />
                          <p className="text-xs text-muted-foreground mt-1">Ethiopian number linked to the wallet</p>
                        </div>
                      </>
                    )}

                    <Button variant="gold" size="lg" className="w-full rounded-xl text-lg h-14 mt-2"
                      disabled={!canConfirm} onClick={() => setStep("confirm")}
                    >
                      Review transfer
                    </Button>
                  </div>
                </CardContent>
              </>
            )}

            {/* ── STEP 3: CONFIRM ───────────────────────────────────────────── */}
            {step === "confirm" && (
              <>
                <CardHeader>
                  <button type="button" onClick={() => setStep("recipient")}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-1 -ml-1"
                  >
                    <ArrowLeft className="h-4 w-4" /> Back
                  </button>
                  <CardTitle>Review &amp; confirm</CardTitle>
                  <p className="text-sm text-muted-foreground">Double-check before sending — illustrative demo</p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4 text-sm">
                    {/* Summary rows */}
                    {[
                      { label: "You send",       value: `$${formatUsd(parsedUsdAmount)} USD` },
                      { label: "Recipient gets", value: `${formatEtb(recipientEtb)} ETB`, gold: true },
                      { label: "Exchange rate",  value: `1 USD = ${PROMO_RATE} ETB` },
                      { label: "Service fee",    value: serviceFee > 0 ? `$${formatUsd(serviceFee)}` : "Free", green: serviceFee === 0 },
                      { label: "Total charged",  value: `$${formatUsd(totalCharged)}`, bold: true },
                    ].map(row => (
                      <div key={row.label} className={cn("flex justify-between items-center py-3 border-b border-white/5", row.bold && "font-semibold text-base")}>
                        <span className="text-muted-foreground">{row.label}</span>
                        <span className={cn(row.gold ? "text-primary font-mono" : row.green ? "text-green-400" : "text-foreground")}>
                          {row.value}
                        </span>
                      </div>
                    ))}

                    <div className="pt-2 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Recipient</span>
                        <span className="text-foreground font-medium">{recipientName}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Location</span>
                        <span className="text-foreground">{recipientLocation}</span>
                      </div>
                      {deliveryMethod === "bank" && selectedBank && (
                        <>
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Bank</span>
                            <span className="text-foreground">{selectedBank.name}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Account</span>
                            <span className="text-foreground font-mono">••••{accountNumber.slice(-4)}</span>
                          </div>
                        </>
                      )}
                      {deliveryMethod === "wallet" && selectedWallet && (
                        <>
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Wallet</span>
                            <span className="text-foreground">{selectedWallet.name}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Phone</span>
                            <span className="text-foreground font-mono">{phoneNumber}</span>
                          </div>
                        </>
                      )}
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Payment via</span>
                        <span className="text-foreground capitalize">
                          {paymentMethod === "balance" ? "Samra balance" : paymentMethod === "card" ? "Card" : "ACH via Plaid"}
                        </span>
                      </div>
                    </div>

                    {shebaMilesEarned > 0 && (
                      <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 mt-2">
                        <Plane className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                        <span className="text-primary font-medium text-sm">+{SHEBA_MILES_BONUS} Sheba Miles will be added · Illustrative demo</span>
                      </div>
                    )}

                    <Button variant="gold" size="lg" className="w-full rounded-xl text-lg h-14 mt-4"
                      onClick={handleConfirm}
                    >
                      Confirm &amp; send ${formatUsd(totalCharged)}
                    </Button>
                  </div>
                </CardContent>
              </>
            )}

            {/* ── STEP 4: SUCCESS ───────────────────────────────────────────── */}
            {step === "success" && (
              <CardContent className="pt-10 pb-10">
                <div className="flex flex-col items-center text-center space-y-6">
                  <div className="w-20 h-20 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center">
                    <CircleCheck className="w-10 h-10 text-green-400" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-serif mb-2">Transfer sent!</h2>
                    <p className="text-muted-foreground text-sm">
                      <span className="text-primary font-semibold">{formatEtb(recipientEtb)} ETB</span> is on its way to{" "}
                      <span className="text-foreground font-medium">{recipientName}</span>
                      {recipientLocation && (
                        <span className="text-muted-foreground"> in {recipientLocation}</span>
                      )}.
                    </p>
                  </div>

                  <div className="w-full bg-background/50 border border-white/5 rounded-2xl p-5 text-sm space-y-2">
                    <div className="flex justify-between text-muted-foreground">
                      <span>You sent</span>
                      <span className="text-foreground">${formatUsd(parsedUsdAmount)} USD</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>They receive</span>
                      <span className="text-primary font-mono">{formatEtb(recipientEtb)} ETB</span>
                    </div>
                    {recipientLocation && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Location</span>
                        <span className="text-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />{recipientLocation}</span>
                      </div>
                    )}
                    {deliveryMethod === "bank" && selectedBank && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Via</span>
                        <span className="text-foreground">{selectedBank.name}</span>
                      </div>
                    )}
                    {deliveryMethod === "wallet" && selectedWallet && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Via</span>
                        <span className="text-foreground">{selectedWallet.name}</span>
                      </div>
                    )}
                    {paymentMethod === "balance" && (
                      <div className="flex justify-between text-muted-foreground border-t border-white/5 pt-2">
                        <span>Remaining balance</span>
                        <span className="text-foreground">${formatUsd(demoBalance)} <span className="opacity-60">(illustrative)</span></span>
                      </div>
                    )}
                  </div>

                  {shebaMilesEarned > 0 && (
                    <div className="flex items-center gap-3 w-full rounded-xl border border-primary/30 bg-primary/10 px-4 py-3">
                      <Plane className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                      <span className="text-primary font-medium text-sm">+{SHEBA_MILES_BONUS} Sheba Miles added · Illustrative demo</span>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">Illustrative demo — no real funds were moved.</p>

                  <Button variant="outline" className="w-full border-white/10 rounded-xl h-12" onClick={handleReset}>
                    Send another transfer
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>

          {/* ── Right card: recent transfers ─────────────────────────────────── */}
          <Card className="bg-card/50 border-white/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5 text-muted-foreground" />
                Recent Transfers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {transfers.map((t) => (
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
