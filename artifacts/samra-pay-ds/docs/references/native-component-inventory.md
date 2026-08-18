# Samra Pay Design System — Native Component Inventory

All native components are located at `src/components/native/`. They use React Native primitives only and are not imported into the web-only Vite preview.

**Import from:** `src/components/native/index.tsx` (re-exports everything)
**Consumer:** Expo / React Native apps — see `docs/consuming-expo.md`

---

## Primitive Components

| Component | Source file | Description |
|-----------|------------|-------------|
| Text | src/components/native/Text.tsx | Semantic typography with 20 variant roles |
| Button | src/components/native/Button.tsx | 5 variants × 3 sizes, enforced touch targets |
| IconButton | src/components/native/IconButton.tsx | Icon-only pressable, required `accessibilityLabel` |
| Card | src/components/native/Card.tsx | Default, elevated, outlined variants |
| Input | src/components/native/Input.tsx | Default, focused, error, disabled states |
| CurrencyInput | src/components/native/CurrencyInput.tsx | Currency display wrapper — never reformats value |
| Label | src/components/native/Label.tsx | Form field labels, required asterisk, error state |
| Field | src/components/native/Field.tsx | Label + input + error composition |
| Badge | src/components/native/Badge.tsx | 7 variants × 2 sizes |
| StatusBadge | src/components/native/StatusBadge.tsx | Financial status with icon + text (never color alone) |
| Spinner | src/components/native/Spinner.tsx | ActivityIndicator wrapper, 3 sizes + 3 colors |
| Skeleton | src/components/native/Skeleton.tsx | Animated shimmer in text, card, circle variants |
| Divider | src/components/native/Divider.tsx | Horizontal or vertical separator |
| Alert | src/components/native/Alert.tsx | Inline alert — info, warning, error, success |
| EmptyState | src/components/native/EmptyState.tsx | Empty list/screen state with optional action |
| ErrorState | src/components/native/ErrorState.tsx | Full error state with optional retry |
| OfflineState | src/components/native/OfflineState.tsx | Offline state using offline status token colors |
| RetryPanel | src/components/native/RetryPanel.tsx | Compact inline retry affordance |
| ModalShell | src/components/native/ModalShell.tsx | React Native Modal with design-system styling |
| BottomSheet | src/components/native/BottomSheet.tsx | Slide-up sheet (Animated + PanResponder, no deps) |
| Toast / ToastProvider / useToast | src/components/native/Toast.tsx | Toast banner with imperative API |
| ListRow | src/components/native/ListRow.tsx | Standard list row — title, subtitle, left/right slots |

---

## Fintech Pattern Components (src/components/native/patterns/)

All fintech patterns are **presentation-only**. They render values supplied by the consumer. They never call APIs, calculate rates/fees/balances, change status, or store financial state.

| Component | Source file | Description |
|-----------|------------|-------------|
| MoneyAmount | src/components/native/patterns/MoneyAmount.tsx | Amount + currency display, 4 sizes |
| BalanceDisplay | src/components/native/patterns/BalanceDisplay.tsx | Balance hero with stale data support |
| AccountSummary | src/components/native/patterns/AccountSummary.tsx | Account card with masked number + balance |
| TransactionRow | src/components/native/patterns/TransactionRow.tsx | Transaction list item with status + amount |
| QuotePanel | src/components/native/patterns/QuotePanel.tsx | Remittance quote: amounts, rate, fee, expiry |
| ExchangeRateDisclosure | src/components/native/patterns/ExchangeRateDisclosure.tsx | Rate disclosure line |
| FeeBreakdown | src/components/native/patterns/FeeBreakdown.tsx | Itemized fee list with total |
| RecipientCard | src/components/native/patterns/RecipientCard.tsx | Recipient summary with masked account |
| DestinationSummary | src/components/native/patterns/DestinationSummary.tsx | Delivery method and arrival estimate |
| TransferStatus | src/components/native/patterns/TransferStatus.tsx | Transfer status with ID and actions |
| TransferTimeline | src/components/native/patterns/TransferTimeline.tsx | Step-by-step vertical timeline |
| TransferReceipt | src/components/native/patterns/TransferReceipt.tsx | Completed transfer receipt |
| ConfirmationPanel | src/components/native/patterns/ConfirmationPanel.tsx | Pre-submission review with full breakdown |
| StaleDataNotice | src/components/native/patterns/StaleDataNotice.tsx | Stale data inline warning |
| ServiceUnavailablePanel | src/components/native/patterns/ServiceUnavailablePanel.tsx | Service outage UI with reference |

---

## Touch Target Compliance

All interactive components enforce minimum touch targets per interaction tokens:
- iOS minimum: 44pt (per Apple HIG)
- Android minimum: 48dp (per Material Design)
- Implementation: `minHeight`/`minWidth` set to `Math.max(componentSize, 48)` in each component.

## Accessibility

All components:
- Set `accessibilityRole` on interactive elements
- Set `accessibilityState` (disabled, busy) where applicable
- Use `accessibilityLabel` — required (not optional) on `Button`, `IconButton`, `CurrencyInput`
- StatusBadge always renders text + icon — never color alone
- Financial amounts have `accessibilityLabel` that reads amount + currency

## Font Loading

Components reference font names from `src/lib/native-theme.tsx`. The consumer must call `useDesignSystemFonts()` in the root layout before rendering text components. Components do not call font loading hooks themselves.

## Safe Area Insets

Components do not hardcode safe area values. `ModalShell` accepts a `safeAreaInsets` prop that the consumer provides via `useSafeAreaInsets()`. This keeps the components portable across device form factors.
