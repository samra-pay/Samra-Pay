# Samra Pay

Marketing website for Samra Pay, a NEO bank for the Ethiopian diaspora in the US — charge card with Ethiopian Airlines points, co-branded upgrade card, remittance calculator, and the Samra Social House cultural hub.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

- `artifacts/samra-pay` — client-side React + Vite site (wouter routing), no backend
- Pages: `/` home, `/cards` (Samra Charge Card + Ethiopian Airlines co-brand comparison), `/remittance` (live USD→ETB calculator, promo rate 180:1), `/social-house` (coffee community + financial literacy cultural hub), `/login` (front-end only, invite-only waitlist toast)
- Design: "Midnight Gold" — dark charcoal + gold, Cormorant Garamond/Outfit, subtle Axumite/Ethiopian motifs, AI-generated card and culture imagery

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
