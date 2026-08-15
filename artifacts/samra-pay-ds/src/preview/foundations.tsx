import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Guidelines } from './parts';
import { Send, Zap } from 'lucide-react';

/* ─── Token references ─────────────────────────────────────────────────────── */

const CORE_SWATCHES = [
  {
    name: 'Primary — Midnight Gold',
    hex: '#d4af37',
    className: 'bg-[#d4af37]',
    text: 'text-black',
    note: 'hsl 46 65% 52%',
  },
  {
    name: 'Secondary',
    hex: '',
    className: 'bg-secondary border',
    text: 'text-secondary-foreground',
    note: 'surface',
  },
  {
    name: 'Accent — Gold wash',
    hex: '#3f3610',
    className: 'bg-accent border',
    text: 'text-accent-foreground',
    note: 'selected state',
  },
] as const;

const SUPPORTING_SWATCHES = [
  { name: 'Background', className: 'border bg-background' },
  { name: 'Foreground', className: 'bg-foreground' },
  { name: 'Muted', className: 'bg-muted' },
  { name: 'Destructive', className: 'bg-destructive' },
  { name: 'Border', className: 'bg-border' },
] as const;

const CHART_SWATCHES = [
  { name: 'Chart 1 — Gold', className: 'bg-[var(--color-chart-1)]' },
  { name: 'Chart 2 — Eucalyptus', className: 'bg-[var(--color-chart-2)]' },
  { name: 'Chart 3 — Berbere', className: 'bg-[var(--color-chart-3)]' },
  { name: 'Chart 4 — Coffee', className: 'bg-[var(--color-chart-4)]' },
  { name: 'Chart 5 — Warm neutral', className: 'bg-[var(--color-chart-5)]' },
] as const;

const CULTURAL_SWATCHES = [
  {
    name: 'Coffee — Buna',
    className: 'bg-coffee text-coffee-foreground',
    role: 'Savings & account categories, secondary chart series',
    origin: 'The coffee ceremony — Ethiopia is the birthplace of coffee',
  },
  {
    name: 'Berbere — Terracotta',
    className: 'bg-berbere text-berbere-foreground',
    role: 'Outflows and debits (never the danger color)',
    origin: 'The deep red-orange of the berbere spice blend',
  },
  {
    name: 'Eucalyptus',
    className: 'bg-eucalyptus text-eucalyptus-foreground',
    role: 'Completed transfers, positive deltas, ETB series',
    origin: 'The eucalyptus groves of the Entoto hills above Addis',
  },
  {
    name: 'Injera — Cream',
    className: 'bg-injera text-injera-foreground',
    role: 'Soft category washes and neutral cultural surfaces',
    origin: 'The warm cream of teff injera',
  },
] as const;

const SANS_SCALE = [
  { label: 'Display', className: 'font-sans text-4xl font-light', sample: 'Banking for the diaspora.' },
  { label: 'Heading', className: 'font-sans text-2xl font-semibold', sample: 'Recent Transactions' },
  { label: 'Body', className: 'font-sans text-base font-normal', sample: 'Your money moves faster with Samra Pay.' },
  { label: 'Label', className: 'font-sans text-sm font-medium', sample: 'Transfer amount' },
  { label: 'Caption', className: 'font-sans text-xs text-muted-foreground', sample: 'Last updated 2 min ago' },
] as const;

const SERIF_SCALE = [
  { label: 'Hero', className: 'font-serif text-5xl font-normal', sample: 'Send money home.' },
  { label: 'Display italic', className: 'font-serif text-3xl italic text-[#d4af37]', sample: 'Rates that respect you.' },
  { label: 'Section heading', className: 'font-serif text-2xl font-semibold', sample: 'How it works' },
  { label: 'Price', className: 'font-serif text-4xl font-semibold', sample: '$1,248.00' },
] as const;

const SPACING_SCALE = [
  { label: '4', className: 'w-4', px: '16px' },
  { label: '6', className: 'w-6', px: '24px' },
  { label: '8', className: 'w-8', px: '32px' },
  { label: '12', className: 'w-12', px: '48px' },
  { label: '24', className: 'w-24', px: '96px' },
] as const;

/* ─── Helpers ───────────────────────────────────────────────────────────────── */

function Swatch({ name, className }: { name: string; className: string }) {
  return (
    <div className="space-y-2">
      <div className={`h-16 rounded-lg ${className}`} />
      <p className="text-sm font-medium">{name}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border bg-card p-5 text-card-foreground">
      <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

/* ─── Overview ──────────────────────────────────────────────────────────────── */

export function OverviewPage() {
  return (
    <div className="space-y-4">
      {/* Core palette */}
      <Section title="Core palette — Midnight Gold">
        <div className="grid grid-cols-3 gap-3">
          {CORE_SWATCHES.map((s) => (
            <div key={s.name} className="space-y-2">
              <div className={`h-16 rounded-lg ${s.className}`} />
              <p className="text-sm font-medium">{s.name}</p>
              {s.note && <p className="text-xs text-muted-foreground">{s.note}</p>}
            </div>
          ))}
        </div>
      </Section>

      {/* Pilot components at a glance */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Buttons */}
        <Section title="Buttons">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="gold"><Send className="h-4 w-4" /> Send Money</Button>
            <Button>Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
          </div>
        </Section>

        {/* Badges */}
        <Section title="Badges">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="gold">Promo Applied</Badge>
            <Badge variant="gold">New</Badge>
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="destructive">Destructive</Badge>
          </div>
        </Section>
      </div>

      {/* Card + Input + Avatar */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Card + Inputs">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Send Money
                <Badge variant="gold" className="text-[10px]">New</Badge>
              </CardTitle>
              <CardDescription>Transfer to Ethiopia in seconds.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="ov-amount">Amount (USD)</Label>
                <Input id="ov-amount" placeholder="0.00" type="number" />
              </div>
              <div className="flex items-center gap-2">
                <Switch defaultChecked id="ov-notify" />
                <Label htmlFor="ov-notify">Notify recipient</Label>
              </div>
            </CardContent>
            <CardFooter className="gap-2">
              <Button variant="gold"><Zap className="h-4 w-4" /> Send</Button>
              <Button variant="outline">Cancel</Button>
            </CardFooter>
          </Card>
        </Section>

        <Section title="Avatars">
          <div className="flex flex-wrap items-center gap-4">
            {[
              { src: '', name: 'Selam Bekele', initials: 'SB' },
              { src: '', name: 'Abebe Girma', initials: 'AG' },
              { src: '', name: 'Tigist Haile', initials: 'TH' },
            ].map((user) => (
              <div key={user.name} className="flex flex-col items-center gap-1.5">
                <Avatar>
                  <AvatarImage src={user.src} alt={user.name} />
                  <AvatarFallback>{user.initials}</AvatarFallback>
                </Avatar>
                <span className="text-xs text-muted-foreground">{user.initials}</span>
              </div>
            ))}
            <div className="flex flex-col items-center gap-1.5">
              <Avatar className="h-6 w-6 text-[10px]">
                <AvatarFallback>SM</AvatarFallback>
              </Avatar>
              <span className="text-xs text-muted-foreground">sm</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <Avatar className="h-14 w-14 text-xl">
                <AvatarFallback>LG</AvatarFallback>
              </Avatar>
              <span className="text-xs text-muted-foreground">lg</span>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}

/* ─── Colors ────────────────────────────────────────────────────────────────── */

export function ColorsPage() {
  return (
    <div className="space-y-8 rounded-xl border bg-card p-6 text-card-foreground">
      <section className="space-y-4">
        <div>
          <h2 className="font-semibold">Brand colors</h2>
          <p className="text-sm text-muted-foreground">
            The three core roles — primary Midnight Gold, secondary surface, and accent gold wash.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {CORE_SWATCHES.map((s) => (
            <div key={s.name} className="space-y-2">
              <div className={`h-20 rounded-lg ${s.className}`} />
              <p className="text-sm font-medium">{s.name}</p>
              {s.note && <p className="text-xs text-muted-foreground">{s.note}</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4 border-t pt-6">
        <div>
          <h2 className="font-semibold">Semantic and surface colors</h2>
          <p className="text-sm text-muted-foreground">
            Roles for page backgrounds, body text, borders, muted content, and danger.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {SUPPORTING_SWATCHES.map((swatch) => (
            <Swatch key={swatch.name} {...swatch} />
          ))}
        </div>
      </section>

      <section className="space-y-4 border-t pt-6">
        <div>
          <h2 className="font-semibold">Cultural palette — rooted in place</h2>
          <p className="text-sm text-muted-foreground">
            A tertiary palette drawn from Ethiopian material culture. Each color carries a
            functional role — cultural color doing real semantic work, not decoration.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {CULTURAL_SWATCHES.map((s) => (
            <div key={s.name} className="space-y-2">
              <div className={`flex h-20 items-end rounded-lg p-3 ${s.className}`}>
                <span className="text-sm font-medium">{s.name}</span>
              </div>
              <p className="text-xs font-medium">{s.role}</p>
              <p className="text-xs text-muted-foreground">{s.origin}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4 border-t pt-6">
        <div>
          <h2 className="font-semibold">Chart colors</h2>
          <p className="text-sm text-muted-foreground">
            Data-viz series — gold leads; eucalyptus, berbere, coffee, and a warm neutral support.
          </p>
        </div>
        <div className="grid grid-cols-5 gap-4">
          {CHART_SWATCHES.map((swatch) => (
            <Swatch key={swatch.name} {...swatch} />
          ))}
        </div>
      </section>

      <section className="space-y-4 border-t pt-6">
        <Guidelines
          items={[
            { kind: 'do', text: 'Use primary (Midnight Gold) for interactive elements, focus rings, and primary actions only.' },
            { kind: 'do', text: 'Use accent (dark gold wash) for selected-state backgrounds in lists, tiles, and nav items.' },
            { kind: 'dont', text: 'Use gold as a text color on white or light backgrounds — it fails WCAG AA at small sizes.' },
            { kind: 'dont', text: 'Mix the gold gradient and the flat gold token in the same component family.' },
          ]}
        />
      </section>
    </div>
  );
}

/* ─── Fonts ─────────────────────────────────────────────────────────────────── */

export function FontsPage() {
  return (
    <div className="space-y-8 rounded-xl border bg-card p-6 text-card-foreground">
      <section className="space-y-6">
        <div>
          <h2 className="font-semibold">Outfit — UI and body</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The primary typeface for all interface copy, labels, navigation, and body text.
            Weight 300 (light) appears in hero contexts; 400 for body; 500–700 for labels and headings.
          </p>
        </div>
        <div className="space-y-4">
          {SANS_SCALE.map((entry) => (
            <div key={entry.label} className="grid gap-1 sm:grid-cols-[100px_1fr]">
              <span className="pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {entry.label}
              </span>
              <p className={entry.className}>{entry.sample}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-6 border-t pt-6">
        <div>
          <h2 className="font-semibold">EB Garamond — Display and editorial</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The serif voice of Samra Pay. Used for hero headings, exchange-rate figures, section titles,
            and italic gold emphasis phrases. Never use for UI labels or small body copy.
          </p>
        </div>
        <div className="space-y-5">
          {SERIF_SCALE.map((entry) => (
            <div key={entry.label} className="grid gap-1 sm:grid-cols-[120px_1fr]">
              <span className="pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {entry.label}
              </span>
              <p className={entry.className}>{entry.sample}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-6 border-t pt-6">
        <div>
          <h2 className="font-semibold">Noto Serif Ethiopic — Amharic / Ge&apos;ez script</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The bilingual voice of a diaspora product. Use <code className="text-xs">font-ethiopic</code> for
            all Amharic copy — it pairs with EB Garamond at display sizes and Outfit in UI. Ge&apos;ez
            glyphs carry more visual density, so step Amharic down one size relative to its
            English counterpart and add breathing room (relaxed line-height).
          </p>
        </div>
        <div className="space-y-5">
          {[
            { label: 'Hero', en: 'Send money home.', am: 'ገንዘብ ወደ ቤት ይላኩ።', enClass: 'font-serif text-4xl', amClass: 'font-ethiopic text-3xl leading-relaxed' },
            { label: 'Heading', en: 'Recent Transactions', am: 'የቅርብ ጊዜ ግብይቶች', enClass: 'font-sans text-2xl font-semibold', amClass: 'font-ethiopic text-xl font-semibold leading-relaxed' },
            { label: 'Body', en: 'Your money moves faster with Samra Pay.', am: 'ገንዘብዎ በሳምራ ፔይ በፍጥነት ይንቀሳቀሳል።', enClass: 'font-sans text-base', amClass: 'font-ethiopic text-sm leading-relaxed' },
            { label: 'Label', en: 'Transfer amount', am: 'የመላኪያ መጠን', enClass: 'font-sans text-sm font-medium', amClass: 'font-ethiopic text-sm font-medium' },
          ].map((row) => (
            <div key={row.label} className="grid gap-1 sm:grid-cols-[100px_1fr_1fr]">
              <span className="pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {row.label}
              </span>
              <p className={row.enClass}>{row.en}</p>
              <p className={row.amClass} lang="am">{row.am}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4 border-t pt-6">
        <Guidelines
          items={[
            { kind: 'do', text: 'Use Outfit for all interactive elements, labels, body text, and navigation.' },
            { kind: 'do', text: 'Use Noto Serif Ethiopic (font-ethiopic) for all Amharic copy — never render Ge\u2019ez script in Outfit or Garamond fallbacks.' },
            { kind: 'dont', text: 'Set Amharic at the same point size as its English sibling — Ge\u2019ez glyphs are denser; step down one size and relax the leading.' },
            { kind: 'do', text: 'Use EB Garamond italic in gold (#d4af37) for editorial emphasis and hero sub-phrases.' },
            { kind: 'dont', text: 'Use Garamond below 18px — it loses legibility and is not designed for small body copy.' },
            { kind: 'dont', text: 'Mix bold Outfit with bold Garamond in the same heading block.' },
          ]}
        />
      </section>
    </div>
  );
}

/* ─── Layout ────────────────────────────────────────────────────────────────── */

export function LayoutPage() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border bg-card p-6 text-card-foreground">
        <h2 className="font-semibold">Spacing</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Base step: 4 px. Cards use p-6 (24 px); dashboard gutters p-4/p-8; page sections pt-32 pb-24.
        </p>
        <div className="mt-6 space-y-4">
          {SPACING_SCALE.map((space) => (
            <div key={space.label} className="flex items-center gap-4">
              <span className="w-10 text-xs text-muted-foreground">{space.px}</span>
              <div className={`h-3 rounded-full bg-primary ${space.className}`} />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border bg-card p-6 text-card-foreground">
        <h2 className="font-semibold">Radius</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Base: 12 px (0.75 rem). Cards, panels, and hero quote widgets use rounded-xl (16 px).
          Inputs and badges use rounded-md (10 px). The large quote card uses 2.5 rem (40 px).
        </p>
        <div className="mt-6 grid grid-cols-2 gap-4">
          {[
            { label: 'Small — 8px', className: 'rounded-sm' },
            { label: 'Medium — 10px', className: 'rounded-md' },
            { label: 'Large — 12px', className: 'rounded-lg' },
            { label: 'XL — 16px', className: 'rounded-xl' },
          ].map((radius) => (
            <div
              key={radius.label}
              className={`flex h-24 items-end border bg-muted p-3 ${radius.className}`}
            >
              <span className="text-xs font-medium">{radius.label}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ─── Patterns ──────────────────────────────────────────────────────────────── */

const PATTERNS = [
  {
    name: 'Telsem dots',
    className: 'pattern-telsem',
    origin: 'Protective dot motifs from telsem talismanic art',
    usage: 'Hero backdrops, large section washes',
  },
  {
    name: 'Axum lattice',
    className: 'pattern-axum',
    origin: 'Interlocking cross grid from Aksumite stelae carving',
    usage: 'Card washes, feature sections, empty states',
  },
  {
    name: 'Tibeb band',
    className: 'pattern-tibeb',
    origin: 'Diamond border strips woven into dress hems (tibeb)',
    usage: 'Section dividers, decorative edges (fixed height strips)',
  },
  {
    name: 'Mesob weave',
    className: 'pattern-mesob',
    origin: 'Concentric coils of the woven mesob basket table',
    usage: 'Feature callouts, radial focal backgrounds',
  },
] as const;

export function PatternsPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-6 text-card-foreground space-y-2">
        <h2 className="font-semibold">Ethiopian pattern system</h2>
        <p className="text-sm text-muted-foreground">
          Four token-driven patterns drawn from Ethiopian material culture. All render from CSS
          gradients tinted by the gold primary, so they adapt to both modes automatically.
          Each ships in three densities: <code className="text-xs">pattern-sparse</code>, base,
          and <code className="text-xs">pattern-dense</code>. Keep them quiet — patterns are
          texture, never content.
        </p>
      </div>

      {PATTERNS.map((p) => (
        <div key={p.name} className="rounded-xl border bg-card p-6 text-card-foreground space-y-4">
          <div>
            <h2 className="font-semibold">{p.name}</h2>
            <p className="text-sm text-muted-foreground">{p.origin}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {(['pattern-sparse', '', 'pattern-dense'] as const).map((density) => (
              <div key={density || 'base'} className="space-y-1.5">
                <div className={`h-28 rounded-lg border bg-background ${p.className} ${density}`} />
                <p className="text-xs text-muted-foreground">
                  {density === 'pattern-sparse' ? 'Sparse' : density === 'pattern-dense' ? 'Dense' : 'Base'}
                </p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Use for: {p.usage}</p>
        </div>
      ))}

      {/* Applied examples */}
      <div className="rounded-xl border bg-card p-6 text-card-foreground space-y-4">
        <div>
          <h2 className="font-semibold">Applied</h2>
          <p className="text-sm text-muted-foreground">
            The patterns in context — as a thin divider strip and as a quiet card wash behind content.
          </p>
        </div>
        <div className="space-y-4">
          {/* Divider strip */}
          <div>
            <p className="mb-2 text-xs text-muted-foreground">Tibeb divider strip (h-3)</p>
            <div className="pattern-tibeb pattern-dense h-3 rounded-full border" />
          </div>
          {/* Card wash */}
          <div>
            <p className="mb-2 text-xs text-muted-foreground">Axum lattice card wash behind content</p>
            <div className="pattern-axum pattern-sparse rounded-xl border bg-background p-6">
              <p className="font-serif text-2xl">Send money home.</p>
              <p className="mt-1 text-sm text-muted-foreground">Zero fees on your first transfer.</p>
            </div>
          </div>
        </div>
        <Guidelines
          items={[
            { kind: 'do', text: 'Keep pattern opacity at or below the default — patterns are ambience, not foreground.' },
            { kind: 'do', text: 'Use the tibeb band only as a thin horizontal strip; it loses its meaning as an area fill.' },
            { kind: 'dont', text: 'Layer two patterns in the same region or place body text directly on a dense pattern.' },
            { kind: 'dont', text: 'Recolor patterns arbitrarily — they inherit the gold primary by design.' },
          ]}
        />
      </div>
    </div>
  );
}

/* ─── Elevation ─────────────────────────────────────────────────────────────── */

export function ElevationPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-6 text-card-foreground space-y-4">
        <div>
          <h2 className="font-semibold">Elevation ramp</h2>
          <p className="text-sm text-muted-foreground">
            Five named steps replace ad-hoc shadows. In dark mode the ramp deepens black shadows;
            in light mode it warms them. Utilities: <code className="text-xs">shadow-e1 … shadow-e5</code>.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-5">
          {[
            { cls: 'shadow-e1', label: 'e1', use: 'Hairline lift' },
            { cls: 'shadow-e2', label: 'e2', use: 'Resting card' },
            { cls: 'shadow-e3', label: 'e3', use: 'Raised card, popover' },
            { cls: 'shadow-e4', label: 'e4', use: 'Overlay, drawer' },
            { cls: 'shadow-e5', label: 'e5', use: 'Modal, command' },
          ].map((s) => (
            <div key={s.label} className="space-y-2">
              <div className={`flex h-24 items-center justify-center rounded-xl border bg-card ${s.cls}`}>
                <span className="font-mono text-sm">{s.label}</span>
              </div>
              <p className="text-xs text-muted-foreground">{s.use}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6 text-card-foreground space-y-4">
        <div>
          <h2 className="font-semibold">Gold ambience</h2>
          <p className="text-sm text-muted-foreground">
            The signature Midnight Gold glow, tokenized. Reserve for brand moments — hero cards,
            the bank card, primary CTAs. Utilities: <code className="text-xs">shadow-gold-sm | md | lg</code>.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            { cls: 'shadow-gold-sm', label: 'gold-sm' },
            { cls: 'shadow-gold-md', label: 'gold-md' },
            { cls: 'shadow-gold-lg', label: 'gold-lg' },
          ].map((s) => (
            <div key={s.label} className={`flex h-28 items-center justify-center rounded-xl border border-primary/30 bg-card ${s.cls}`}>
              <span className="font-mono text-sm">{s.label}</span>
            </div>
          ))}
        </div>
        <Guidelines
          items={[
            { kind: 'do', text: 'Step exactly one level when an element lifts on interaction (e2 → e3).' },
            { kind: 'do', text: 'Reserve gold ambience for at most one element per view.' },
            { kind: 'dont', text: 'Compose raw box-shadows in components — always use the named ramp.' },
            { kind: 'dont', text: 'Put gold glow on destructive or muted elements.' },
          ]}
        />
      </div>
    </div>
  );
}

/* ─── Motion ────────────────────────────────────────────────────────────────── */

export function MotionPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-6 text-card-foreground space-y-4">
        <div>
          <h2 className="font-semibold">Easing & duration</h2>
          <p className="text-sm text-muted-foreground">
            Motion is calm and assured — money movement should feel deliberate, never jittery.
            Four easing tokens and a four-step duration scale cover every case.
          </p>
        </div>
        <div className="grid gap-3 text-sm sm:grid-cols-4">
          {[
            { name: 'duration-swift', value: '150 ms', desc: 'Hover, focus, color' },
            { name: 'duration-standard', value: '250 ms', desc: 'Most transitions' },
            { name: 'duration-gentle', value: '400 ms', desc: 'Entrances, reveals' },
            { name: 'duration-slow', value: '500 ms', desc: 'Ceiling — never exceed' },
          ].map((d) => (
            <div key={d.name} className="rounded-lg border bg-background p-3">
              <code className="text-xs text-primary">{d.name}</code>
              <p className="mt-1 text-xs font-medium">{d.value}</p>
              <p className="text-xs text-muted-foreground">{d.desc}</p>
            </div>
          ))}
        </div>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          {[
            { name: 'ease-standard', desc: 'Default for property transitions (hover, color, size).' },
            { name: 'ease-entrance', desc: 'Decelerating — content arriving on screen.' },
            { name: 'ease-emphasized', desc: 'Slight overshoot — celebratory moments (transfer sent).' },
            { name: 'ease-exit', desc: 'Accelerating — content leaving.' },
          ].map((e) => (
            <div key={e.name} className="rounded-lg border bg-background p-3">
              <code className="text-xs text-primary">{e.name}</code>
              <p className="mt-1 text-xs text-muted-foreground">{e.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6 text-card-foreground space-y-4">
        <div>
          <h2 className="font-semibold">Entrance & ambient animations</h2>
          <p className="text-sm text-muted-foreground">
            Named animation utilities. Ambient floats are reserved for hero decoration; entrances
            choreograph content arrival top-down with 50–80 ms stagger.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <div className="flex h-28 items-center justify-center gap-4 rounded-lg border bg-background">
              <div className="animate-float-slow h-12 w-12 rounded-lg border border-primary/40 bg-accent" />
              <div className="animate-float-slow-reverse h-9 w-9 rounded-full border border-primary/40 bg-accent" />
            </div>
            <p className="text-xs text-muted-foreground">
              <code>animate-float-slow / -reverse</code> — ambient hero decoration
            </p>
          </div>
          <div className="space-y-1.5">
            <div className="flex h-28 items-center justify-center rounded-lg border bg-background">
              <div className="animate-shimmer rounded-md border border-primary/30 bg-[linear-gradient(110deg,transparent_35%,hsl(var(--primary)/0.15)_50%,transparent_65%)] bg-[length:200%_100%] px-4 py-2 text-sm">
                Processing transfer…
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              <code>animate-shimmer</code> — in-flight states
            </p>
          </div>
        </div>
        <Guidelines
          items={[
            { kind: 'do', text: 'Use animate-fade-up with a small stagger for lists and dashboards arriving on screen.' },
            { kind: 'do', text: 'Respect the reduced-motion contract — it ships with the theme; never override it.' },
            { kind: 'dont', text: 'Animate layout properties (width, height, top) — use transform and opacity only.' },
            { kind: 'dont', text: 'Exceed 500 ms for interface motion; slow motion reads as slow software.' },
          ]}
        />
      </div>
    </div>
  );
}

/* ─── Brand — Logo ──────────────────────────────────────────────────────────── */

export function LogoPage() {
  const logoUrl = `${import.meta.env.BASE_URL}logo.png`;

  return (
    <div className="space-y-6">
      {/* Mark on dark */}
      <div className="rounded-xl border bg-card p-6 text-card-foreground space-y-4">
        <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Mark — dark background</h2>
        <div className="flex items-center justify-center rounded-lg bg-[#0a0a0a] py-12 border">
          <img src={logoUrl} alt="Samra Pay" className="h-16 w-auto" />
        </div>
        <p className="text-sm text-muted-foreground">
          The primary wordmark. Use on dark (#0a0a0a or equivalent) or deep-colored surfaces.
          Minimum clear space: one cap-height on all sides.
        </p>
      </div>

      {/* Mark on light */}
      <div className="rounded-xl border bg-card p-6 text-card-foreground space-y-4">
        <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Mark — light background</h2>
        <div className="flex items-center justify-center rounded-lg bg-[#faf9f4] py-12 border">
          <img src={logoUrl} alt="Samra Pay" className="h-16 w-auto" />
        </div>
        <p className="text-sm text-muted-foreground">
          On warm-ivory or white surfaces. The gold in the mark reads well on either background.
        </p>
      </div>

      {/* Sizes */}
      <div className="rounded-xl border bg-card p-6 text-card-foreground space-y-4">
        <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Scale</h2>
        <div className="flex flex-wrap items-end gap-8">
          {[
            { label: 'Favicon — 32px', h: 'h-8' },
            { label: 'App icon — 48px', h: 'h-12' },
            { label: 'Header — 28px', h: 'h-7' },
            { label: 'Hero — 64px', h: 'h-16' },
          ].map((s) => (
            <div key={s.label} className="flex flex-col items-center gap-2">
              <img src={logoUrl} alt="Samra Pay" className={`${s.h} w-auto`} />
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Usage guidelines */}
      <div className="rounded-xl border bg-card p-6 text-card-foreground space-y-4">
        <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Usage</h2>
        <Guidelines
          items={[
            { kind: 'do', text: 'Place the mark on dark (#0a0a0a) or warm-ivory (#faf9f4) backgrounds for maximum contrast.' },
            { kind: 'do', text: 'Maintain a minimum height of 24px (6 units) in all rendered contexts.' },
            { kind: 'dont', text: 'Recolor, add drop shadows, or place the mark on a gold or bright-colored background.' },
            { kind: 'dont', text: 'Stretch or distort the mark — always scale with a fixed aspect ratio.' },
          ]}
        />
      </div>
    </div>
  );
}
