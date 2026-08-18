# Design Foundations — Samra Pay Design System

This document describes the visual and conceptual foundations of the Midnight Gold design system.

---

## 1. Brand Identity

### Name and positioning
**Samra Pay** — a remittance platform serving the Ethiopian diaspora. The name "Samra" (ሳምራ) is an Ethiopian name meaning "pleasant" or "entertainer." The brand bridges Ethiopian cultural heritage with modern financial services.

### Canonical visual character
- **Dark-first** — The Samra Pay product renders in forced-dark mode. The Midnight Gold palette is the canonical dark mode.
- **Gold + Black** — Primary visual tension between #d4af37 (22-karat Midnight Gold) and #0a0a0a (near-black). Gold represents aspiration, heritage, and trust.
- **Serif + sans-serif** — EB Garamond for display and financial figures (heritage, weight, editorial), Outfit for UI copy (modern, readable, clean).
- **Ethiopian motifs** — CSS pattern utilities provide authentic cultural texture without requiring image assets.

---

## 2. Color System

### Midnight Gold Palette

**Primary:**
- `#d4af37` — 22-karat Midnight Gold. Single brand color, consistent across both modes.
- HSL equivalent: 46° 65% 52%

**Dark mode (canonical):**
- Background: `#0a0a0a` (0° 0% 4%)
- Foreground: `#f5f5f5` (near-white)
- Card: `#0f0f0f` (slightly lighter than background)
- Accent: `#3f3610` (dark gold wash for selected states)

**Light mode (warm-ivory derivation):**
- Background: `#faf9f4` (warm ivory)
- Foreground: `#1a1505` (very dark warm black)
- Card: `#ffffff`

### Cultural Palette

| Name | Light | Dark | Semantic Role |
|------|-------|------|---------------|
| Coffee (Buna) | `#6f4a2b` | `#ab7549` | Savings, accounts, secondary chart |
| Berbere | `#a8442a` | `#cf6644` | Outflows, debits, warm emphasis |
| Eucalyptus | `#41694c` | `#6b9a78` | Completed transfers, positive deltas, ETB |
| Injera | `#efe6d0` | `#2a2419` | Cultural content surfaces |

These colors are named after Ethiopian foods and plants. They are NOT general-purpose semantic colors — each has a specific role. Coffee is not "warning." Berbere is not "error" (use `destructive` for errors).

---

## 3. Typography

### Type system

| Family | Token | Role |
|--------|-------|------|
| Outfit | `--font-sans` | Primary UI, body, labels, buttons |
| EB Garamond | `--font-serif` | Display, editorial, exchange rates |
| Noto Serif Ethiopic | `--font-ethiopic` | All Amharic / Ge'ez script text |
| System mono | `--font-mono` | Reference numbers, account IDs, code |

### Typographic hierarchy

The type scale follows the semantic `textStyle` tokens — see `docs/semantic-tokens.md` for the full table. Key principles:
- **Display** (EB Garamond) is for hero moments only — not headings.
- **Heading** (Outfit SemiBold) for structural hierarchy.
- **Body** (Outfit Regular) at 1.6 line height for readability.
- **Numeric** variants (balance, amount, rate) have specific font/weight choices that match the physical weight of financial data.
- **Ethiopic** variants always use Noto Serif Ethiopic — never substitute Outfit for Amharic text.

---

## 4. Elevation

Five named levels plus gold-ambient glows:

| Level | Web class | Use |
|-------|-----------|-----|
| e1 | `shadow-e1` | Hairline, adjacent surfaces |
| e2 | `shadow-e2` | Standard cards |
| e3 | `shadow-e3` | Popovers, floating elements |
| e4 | `shadow-e4` | Drawers, bottom sheets |
| e5 | `shadow-e5` | Modals |
| Gold small | `shadow-gold-sm` | Subtle brand glow |
| Gold medium | `shadow-gold-md` | Active gold elements |
| Gold large | `shadow-gold-lg` | Hero feature emphasis |

Light mode shadows use warm rgba(43, 33, 10, …) (warm black tint). Dark mode shadows use pure rgba(0, 0, 0, …) with gold ambient.

---

## 5. Motion

Four named duration steps:

| Name | Duration | Use |
|------|----------|-----|
| Swift | 150ms | Hover, micro-interactions |
| Standard | 250ms | Default transitions |
| Gentle | 400ms | Modal/panel entrance |
| Slow | 500ms | Onboarding, illustration |

Four easings:
- `ease-standard`: General purpose (Material smooth)
- `ease-entrance`: Spring for entering elements
- `ease-emphasized`: Overshoot spring for expressive moments
- `ease-exit`: Quick departure

All animations respect `prefers-reduced-motion` — the CSS theme collapses all durations to 0.01ms automatically.

---

## 6. Ethiopian Pattern System

Four CSS gradient patterns inspired by traditional Ethiopian design:

| Class | Inspiration | Use |
|-------|-------------|-----|
| `pattern-telsem` | Telsem talismanic dot motif | Subtle background wash, empty states |
| `pattern-axum` | Aksumite stelae cross lattice | Section dividers, hero backgrounds |
| `pattern-tibeb` | Tibeb woven dress hem border | Horizontal dividers, section edges |
| `pattern-mesob` | Mesob woven basket weave | Card backgrounds, decorative surfaces |

Density modifiers: `pattern-sparse` (larger cells), base, `pattern-dense` (smaller cells).

All patterns use `--pattern-ink: var(--primary)` — they adapt to both light and dark mode automatically and use gold as the ink color.

---

## 7. Spacing and Layout

Base unit: **4px** (0.25rem). All spacing should be multiples of this unit.

Common steps: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.

Gutters: 16px mobile, 24px tablet, 32px desktop.

Content widths follow standard breakpoints (640/768/1024/1280/1440px) aligned with Tailwind's default system.

See `docs/semantic-tokens.md` for full layout token reference.

---

## 8. Border Radius

Base radius: **0.75rem** (12px).

| Scale | Value | Use |
|-------|-------|-----|
| sm | 8px | Inputs, badges, small elements |
| md | 10px | Buttons, medium elements |
| lg | 12px | Cards, panels (base) |
| xl | 16px | Large cards, modals |

---

## 9. Accessibility as Foundation

Accessibility is not an add-on — it is baked into the token system:
- All palette pairs pass WCAG AA 4.5:1 contrast (validated on every token build)
- Interaction tokens define minimum touch targets (44pt iOS, 48dp Android)
- Status tokens include `textRequired: true` and `accessibilityNote` for every status
- Motion tokens are paired with a reduced-motion contract
- Focus ring uses the primary gold (#d4af37) at 2px width

See `docs/accessibility.md` for enforcement details.
