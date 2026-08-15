# Samra Pay

Samra Pay is currently a polished web/mobile concept plus an isolated synthetic
architecture foundation. The foundation proves application and ledger logic;
it does not represent live accounts, custody, settlement, providers, or
regulatory approval.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — build and run the API on the
  Replit-assigned `PORT` (currently routed as API port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API client and
  Zod schemas from OpenAPI
- `pnpm run db:migrate` — manually apply reviewed migrations; never runs at
  startup, build, or post-merge
- `DATABASE_URL` is required only for an explicit migration/database command.
  The current API imports and health route do not require it.

Safe defaults keep the existing demos unchanged:

```text
SAMRA_BACKEND_MODE=disabled
SAMRA_PROVIDER_MODE=fake
SAMRA_RUN_WORKER=false
VITE_SAMRA_DATA_MODE=mock
```

See `docs/architecture/replit-runbook.md` before enabling branch preview mode.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: generated Zod 3 request/response contracts, `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild ESM bundle

## Where things live

- `lib/ledger` — double-entry journal, holds, balances, reversals, invariants
- `lib/remittance` — quotes, transfer state machines, fake provider ports,
  inbox/outbox domain logic
- `lib/db` — additive PostgreSQL/Drizzle schema and unapplied migrations
- `lib/api-spec` — source OpenAPI contract
- `lib/samra-client` — stable client boundary and generated transport adapter
- `artifacts/api-server` — Express composition, fake-provider runtime, worker,
  API routes
- `artifacts/samra-pay` — existing web experience plus explicit remittance API
  mode

## Architecture decisions

- Samra owns the control ledger, customer/application data, reconciliation, and
  provider mappings.
- Fake Rain represents domestic USD account funding, fake Caliza remittance
  movement, and fake Chapa Ethiopian payout.
- Internal money is `bigint` minor units; API money is a decimal integer string.
- The current demo runtime is process memory and resets on restart. PostgreSQL
  persistence is the next slice.
- Mobile remains on the legacy demo until the web/API contract stabilizes.

## Product

- `artifacts/samra-pay` — React + Vite site using wouter routing. Only
  `/dashboard/remittance` has an explicit API-mode cutover; all other screens
  remain legacy demos.
- Pages: `/` home, `/cards` (Samra Charge Card + Ethiopian Airlines co-brand comparison), `/remittance` (live USD→ETB calculator, promo rate 180:1), `/social-house` (coffee community + financial literacy cultural hub), `/login` (dummy — sign in with empty fields routes to /dashboard)
- `/dashboard` + sub-pages (cards, credit, analytics, remittance, settings): mock neo-bank dashboard for demo user "Selam T." — debit/charge/co-brand cards, ShebaMiles, credit tracking, per-card transactions, spending analytics
- Ethiopian Airlines logo asset: `artifacts/samra-pay/src/assets/ethiopian-airlines-logo.svg` (used on the co-branded card composition)
- Design: "Midnight Gold" — dark charcoal + gold, Cormorant Garamond/Outfit, subtle Axumite/Ethiopian motifs, AI-generated card and culture imagery
- Brand mark: `attached_assets/Screenshot_2026-08-11_at_2.47.22_PM_1786474044093.png` is the canonical “SP” mark; use it for web favicons and the square exports in `artifacts/samra-pay/public/icons/` for future app builds.

## Gotchas

- Do not run a migration against a shared database.
- Do not enable API mode without demo backend mode; API errors must remain
  visible and must never fall back to mock financial state.
- The workspace intentionally excludes non-Linux native packages for Replit.
  Run the final test/build gate on Replit Linux.

## Pointers

- Architecture overview: `docs/architecture/README.md`
- Ledger model: `docs/architecture/ledger.md`
- Remittance lifecycle: `docs/architecture/remittance.md`
- Replit safety gates: `docs/architecture/replit-runbook.md`
