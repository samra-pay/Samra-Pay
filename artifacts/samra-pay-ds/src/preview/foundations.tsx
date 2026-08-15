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
  { name: 'Chart 2 — Green', className: 'bg-[var(--color-chart-2)]' },
  { name: 'Chart 3 — Red', className: 'bg-[var(--color-chart-3)]' },
  { name: 'Chart 4 — Muted gold', className: 'bg-[var(--color-chart-4)]' },
  { name: 'Chart 5 — Neutral', className: 'bg-[var(--color-chart-5)]' },
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
          <h2 className="font-semibold">Chart colors</h2>
          <p className="text-sm text-muted-foreground">
            Data-viz series — gold leads; green, red, muted gold, and neutral gray support.
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

      <section className="space-y-4 border-t pt-6">
        <Guidelines
          items={[
            { kind: 'do', text: 'Use Outfit for all interactive elements, labels, body text, and navigation.' },
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
