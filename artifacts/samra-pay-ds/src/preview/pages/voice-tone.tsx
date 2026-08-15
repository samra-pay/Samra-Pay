import { Guidelines } from '../parts';

/* ─── Helpers ───────────────────────────────────────────────────────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border bg-card p-6 text-card-foreground">
      <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

/** A before/after copy pair — the cold/jargon version vs the Samra Pay voice. */
function CopyPair({
  avoid,
  prefer,
  note,
}: {
  avoid: string;
  prefer: string;
  note?: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5 rounded-lg border border-destructive/30 bg-background p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-destructive">Avoid</p>
        <p className="text-sm text-muted-foreground line-through decoration-destructive/50">{avoid}</p>
      </div>
      <div className="space-y-1.5 rounded-lg border border-primary/30 bg-accent/40 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-primary">Prefer</p>
        <p className="text-sm">{prefer}</p>
        {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      </div>
    </div>
  );
}

/** An illustrative-figure badge — reused wherever a money claim appears. */
function IllustrativeTag() {
  return (
    <span className="inline-flex items-center rounded-full border border-primary/30 bg-accent/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
      Illustrative
    </span>
  );
}

/* ─── Data ──────────────────────────────────────────────────────────────────── */

const PRINCIPLES = [
  {
    name: 'Warm, never clinical',
    body: 'Write like a trusted relative who happens to know banking — not a compliance form. Lead with the person and the outcome, not the mechanism.',
    avoid: 'Transaction 0x8F2 terminated. Error code 402.',
    prefer: 'That transfer didn\u2019t go through. Your money is safe — let\u2019s try again.',
    note: 'Reassure first, then act. Never make someone feel like they broke something.',
  },
  {
    name: 'Direct, never vague',
    body: 'Say exactly what happened and exactly what to do next. Short sentences. No hedging, no filler, no corporate throat-clearing.',
    avoid: 'Your request has been submitted and is currently being processed by our systems.',
    prefer: 'We\u2019re sending your money now. This usually takes a few minutes.',
    note: 'One idea per sentence. Prefer the active voice.',
  },
  {
    name: 'Dignified, never patronizing',
    body: 'Our people are professionals, parents, and providers. Speak to competence. Celebrate the moment — sending money home is an act of love, not a chore.',
    avoid: 'Success! Your payment was processed successfully.',
    prefer: 'Money is on its way to Selam.',
    note: 'Name the person and the intent. The transfer is the means; the family is the point.',
  },
];

const BILINGUAL_ROWS = [
  {
    label: 'Hero',
    en: 'Send money home.',
    am: 'ገንዘብ ወደ ቤት ይላኩ።',
    enClass: 'font-serif text-3xl',
    amClass: 'font-ethiopic text-2xl leading-relaxed',
  },
  {
    label: 'Confirmation',
    en: 'Money is on its way to Selam.',
    am: 'ገንዘብዎ ወደ ሰላም እየሄደ ነው።',
    enClass: 'font-sans text-lg font-medium',
    amClass: 'font-ethiopic text-base font-medium leading-relaxed',
  },
  {
    label: 'Label',
    en: 'Transfer amount',
    am: 'የመላኪያ መጠን',
    enClass: 'font-sans text-sm font-medium',
    amClass: 'font-ethiopic text-sm font-medium leading-relaxed',
  },
] as const;

const FORMATS = [
  { rule: 'Sentence case', good: 'Send money home', bad: 'Send Money Home' },
  { rule: 'USD amounts', good: '$1,240.00', bad: '1240 dollars' },
  { rule: 'ETB amounts', good: 'ETB 152,520', bad: '152520 birr' },
  { rule: 'Dates', good: 'Aug 14, 2026', bad: '08/14/26' },
  { rule: 'Money uses numerals', good: 'Send $50', bad: 'Send fifty dollars' },
] as const;

const BUTTON_VERBS = [
  { verb: 'Send', use: 'Move money to a recipient' },
  { verb: 'Review', use: 'Check details before committing' },
  { verb: 'Confirm', use: 'Commit an action after review' },
  { verb: 'Pay', use: 'Settle a bill or balance' },
  { verb: 'Add recipient', use: 'Create something new' },
] as const;

const WEAK_VERBS = ['Submit', 'OK', 'Proceed', 'Go', 'Continue (as a final action)'];

/* ─── Page ──────────────────────────────────────────────────────────────────── */

export function VoiceTonePage() {
  return (
    <div className="space-y-6">
      {/* Brand register */}
      <div className="rounded-xl border bg-card p-6 text-card-foreground space-y-2">
        <h1 className="font-serif text-3xl">Voice &amp; tone</h1>
        <p className="text-sm text-muted-foreground">
          Samra Pay speaks like banking built <span className="italic text-primary">for the diaspora</span> — warm,
          direct, and dignified. Every string is written for someone sending money to family they love, often
          from a country far away. The voice is confident without being cold, and human without being cute.
        </p>
        <p className="text-xs text-muted-foreground">
          This is a product demonstration. All figures, rates, and balances in these examples are{' '}
          <IllustrativeTag /> and stand in for content that will be finalized when live services exist.
        </p>
      </div>

      {/* Principles */}
      <Section title="Voice principles">
        <div className="space-y-6">
          {PRINCIPLES.map((p) => (
            <div key={p.name} className="space-y-3 border-b pb-6 last:border-b-0 last:pb-0">
              <div>
                <h3 className="text-base font-semibold">{p.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{p.body}</p>
              </div>
              <CopyPair avoid={p.avoid} prefer={p.prefer} note={p.note} />
            </div>
          ))}
        </div>
      </Section>

      {/* Bilingual copy */}
      <Section title="Bilingual copy — English & Amharic">
        <p className="text-sm text-muted-foreground">
          Amharic is a first-class voice, not a translation afterthought. When both languages appear, English
          leads and Amharic pairs beneath or beside it in <code className="text-xs">font-ethiopic</code>. Ge&apos;ez
          glyphs carry more visual density, so step Amharic down one size from its English sibling and relax the
          leading — consistent with the Fonts specimen. Tone must be equal in both: if the English is warm and
          direct, the Amharic is too. Never let one language be celebratory and the other purely functional.
        </p>
        <div className="space-y-5">
          {BILINGUAL_ROWS.map((row) => (
            <div key={row.label} className="grid gap-1 sm:grid-cols-[110px_1fr_1fr]">
              <span className="pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {row.label}
              </span>
              <p className={row.enClass}>{row.en}</p>
              <p className={row.amClass} lang="am">
                {row.am}
              </p>
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-primary/30 bg-accent/40 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">Tone parity</p>
          <p className="mt-1.5 text-sm">
            English: <span className="font-medium">Money is on its way to Selam.</span>
          </p>
          <p className="mt-1 font-ethiopic text-sm leading-relaxed" lang="am">
            አማርኛ፦ ገንዘብዎ ወደ ሰላም እየሄደ ነው።
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Both name the person and carry the same warmth — neither reads like a system log.
          </p>
        </div>
      </Section>

      {/* Trust language */}
      <Section title="Trust language">
        <p className="text-sm text-muted-foreground">
          Samra Pay is a client-side demonstration. Clear boundaries keep visitors from mistaking mock balances,
          promotional rates, or card benefits for live financial offers. These rules are non-negotiable.
        </p>
        <ul className="space-y-2 text-sm">
          <li className="flex gap-3">
            <span className="shrink-0 font-medium text-primary">Rule</span>
            <span className="text-muted-foreground">
              Label every metric, rate, and benefit as illustrative near the claim itself — not only in a footer.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 font-medium text-primary">Rule</span>
            <span className="text-muted-foreground">
              Every CTA must match its real destination and behavior. A &ldquo;Send money&rdquo; button opens the
              demo send flow — it never implies a live transfer.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 font-medium text-primary">Rule</span>
            <span className="text-muted-foreground">
              No unsupported guarantees — avoid &ldquo;guaranteed,&rdquo; &ldquo;best rate,&rdquo; or &ldquo;always
              free&rdquo; unless a live service backs the claim.
            </span>
          </li>
        </ul>
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Rate copy — do &amp; don&apos;t
          </p>
          <CopyPair
            avoid="Guaranteed best exchange rate: 1 USD = 152.52 ETB. Always beat the bank."
            prefer="Illustrative rate: 1 USD \u2248 152.52 ETB. Figures shown are for demonstration only."
            note="Mark the figure illustrative, drop the guarantee, and keep the number honest about being a demo."
          />
        </div>
      </Section>

      {/* Microcopy conventions */}
      <Section title="Microcopy conventions">
        <div className="space-y-2">
          <h3 className="text-base font-semibold">Formatting</h3>
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="p-3 font-medium">Rule</th>
                  <th className="p-3 font-medium text-primary">Do</th>
                  <th className="p-3 font-medium text-destructive">Don&apos;t</th>
                </tr>
              </thead>
              <tbody>
                {FORMATS.map((f) => (
                  <tr key={f.rule} className="border-b last:border-b-0">
                    <td className="p-3 text-muted-foreground">{f.rule}</td>
                    <td className="p-3 font-medium">{f.good}</td>
                    <td className="p-3 text-muted-foreground line-through decoration-destructive/50">
                      {f.bad}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Money figures above are <IllustrativeTag /> demonstration values.
          </p>
        </div>

        <div className="space-y-2 border-t pt-4">
          <h3 className="text-base font-semibold">Button verbs</h3>
          <p className="text-sm text-muted-foreground">
            Buttons name the specific action. Use a verb the person would say out loud — never a generic system word.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 rounded-lg border border-primary/30 bg-accent/40 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-primary">Use</p>
              <ul className="space-y-1.5 text-sm">
                {BUTTON_VERBS.map((b) => (
                  <li key={b.verb} className="flex gap-2">
                    <span className="font-medium">{b.verb}</span>
                    <span className="text-muted-foreground">— {b.use}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-2 rounded-lg border border-destructive/30 bg-background p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-destructive">Avoid</p>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                {WEAK_VERBS.map((v) => (
                  <li key={v} className="line-through decoration-destructive/50">
                    {v}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                These say nothing about what happens next.
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* Guidelines */}
      <Section title="Guidelines">
        <Guidelines
          items={[
            { kind: 'do', text: 'Lead with the person and the outcome — "Money is on its way to Selam," not "Transaction complete."' },
            { kind: 'do', text: 'Pair English with Amharic (font-ethiopic, one size down, relaxed leading) and keep the warmth equal in both languages.' },
            { kind: 'do', text: 'Label every rate, metric, and balance as illustrative right next to the number.' },
            { kind: 'do', text: 'Use specific button verbs — Send, Review, Confirm, Pay — that describe the exact next step.' },
            { kind: 'dont', text: 'Surface raw error codes or system jargon; reassure the person their money is safe, then say what to do.' },
            { kind: 'dont', text: 'Make guarantees ("best rate," "always free") the demo cannot back, or let a CTA imply a live transfer.' },
            { kind: 'dont', text: 'Use Submit, OK, or Proceed on primary actions — they describe nothing.' },
            { kind: 'dont', text: 'Set Amharic at the same size as its English sibling or treat it as a lesser translation.' },
          ]}
        />
      </Section>
    </div>
  );
}
