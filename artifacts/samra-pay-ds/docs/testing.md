# Design-system testing

The design system uses Node's built-in test runner. Current CI results and the
exact commit are evidence; copied pass counts in documentation are not.

## Automated gates

| Gate | Proves |
| --- | --- |
| `tokens.test.mjs` | Required token groups, aliases, and generated-file boundaries |
| `contrast.test.mjs` | Required palette-pair WCAG contrast |
| `a11y.test.mjs` | Touch targets, status text requirements, and interaction defaults |
| `docs.test.mjs` | Required governing documents and supported references |
| source-boundary check | ZIPs, generated output, and foreign design artifacts cannot become source truth |
| package typecheck and build | Web/native exports and the review browser compile |
| experience-budget gate | Customer, operations, and mobile artifacts remain within reviewed ceilings |

Run the package gates from the repository root:

```sh
pnpm --filter @workspace/samra-pay-ds test
pnpm --filter @workspace/samra-pay-ds typecheck
pnpm --filter @workspace/samra-pay-ds build
node artifacts/samra-pay-ds/scripts/check-source-boundary.mjs
```

## Required manual evidence

Automated tests do not prove:

- VoiceOver and TalkBack behavior;
- maximum Dynamic Type and Android font scaling;
- Ethiopic font and keyboard rendering;
- touch gestures, toast placement, notches, or Dynamic Island behavior;
- reduced-motion behavior on real devices;
- OLED/LCD appearance or cross-browser visual fidelity;
- complete Auth0, Persona, Crossmint, failure, recovery, and restricted-customer journeys.

Record manual cases and results in Qase against the exact GitHub commit. Never
place credentials, access tokens, customer PII, identity evidence, or raw
provider payloads in Qase attachments.

## Open gaps

Before Alpha experience acceptance:

1. extend contrast testing to every status foreground/background pair;
2. complete representative iOS and Android device checks;
3. add screenshot or visual-regression evidence only after its ownership and
   false-positive policy are defined.

See [open design decisions](open-decisions.md),
[accessibility](accessibility.md), and the repository
[testing strategy](../../../docs/testing/testing-strategy.md).
