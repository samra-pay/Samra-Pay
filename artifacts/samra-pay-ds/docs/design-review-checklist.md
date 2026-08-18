# Design review checklist

Every material design-system or product-interface change must be evaluated at
the exact Git commit proposed for merge.

## Product and financial truth

- The screen has a defined user, task, and decision.
- Financial values come from the approved API or are visibly labelled synthetic.
- Ledger, provider, transfer, refund, reversal, and reconciliation states are
  not collapsed into misleading generic statuses.
- An unavailable API never silently substitutes mock financial data.
- Destructive or financially consequential actions require explicit confirmation.

## System integrity

- Existing tokens and components were reused before new primitives were added.
- New semantic values were added to `tokens.json`, not scattered as raw values.
- Web and native naming remains aligned where the interaction is equivalent.
- Component exports, types, documentation, and preview examples are complete.
- No `dist/`, `.tsbuildinfo`, ZIP, or unreviewed raw export entered source control.

## Complete interaction states

- Default, hover, focus, pressed, selected, disabled, and destructive states exist.
- Loading, skeleton, empty, stale, offline, unavailable, error, retry, and success
  states exist where the workflow can encounter them.
- Navigation, Back, Exit, Cancel, Retry, and Resume behavior is explicit.
- Long content, large amounts, localization expansion, and missing optional data
  do not break the layout.

## Accessibility and content

- Keyboard order, visible focus, labels, roles, status announcements, and error
  associations are correct.
- Contrast and non-color status cues meet the documented accessibility standard.
- Reduced-motion behavior preserves meaning.
- Copy is direct, specific, and does not overstate provider, regulatory, or
  production readiness.

## Responsive and native review

- Customer web and Operations Portal were checked at narrow, medium, and wide
  widths.
- Touch targets, safe areas, keyboard avoidance, and platform conventions were
  checked for native components.
- Web and mobile can differ where platform behavior requires it without changing
  the underlying product meaning.

## Required evidence

- Token drift check passed.
- Design-system tests passed.
- Typecheck passed.
- GitHub preview artifact built from the reviewed commit.
- Reviewer inspected relevant component, financial pattern, and applied-screen
  examples.
- Any intentional exception is documented in the pull request with an owner and
  follow-up date.
