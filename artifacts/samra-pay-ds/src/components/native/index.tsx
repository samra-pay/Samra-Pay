/**
 * Samra Pay Design System — Native Component Library
 *
 * Re-exports all React Native components. Import from this file or directly
 * from each component's module.
 *
 * These components:
 * - Use React Native primitives only (no web/DOM/Radix imports)
 * - Reference token values from ../lib/native-theme and ../../hooks/use-colors
 * - Are NOT imported into the web-only Vite preview
 * - Default to forced-dark scheme (Samra Pay is dark-first)
 */

export { Text } from "./Text";
export type { TextProps, TextVariant } from "./Text";

export { Button } from "./Button";
export type { ButtonProps, ButtonVariant, ButtonSize } from "./Button";

export { IconButton } from "./IconButton";
export type { IconButtonProps, IconButtonSize, IconButtonVariant } from "./IconButton";

export { Card } from "./Card";
export type { CardProps, CardVariant, CardPadding } from "./Card";

export { Input } from "./Input";
export type { InputProps } from "./Input";

export { CurrencyInput } from "./CurrencyInput";
export type { CurrencyInputProps } from "./CurrencyInput";

export { Label } from "./Label";
export type { LabelProps, LabelVariant } from "./Label";

export { Field } from "./Field";
export type { FieldProps } from "./Field";

export { Badge } from "./Badge";
export type { BadgeProps, BadgeVariant, BadgeSize } from "./Badge";

export { StatusBadge } from "./StatusBadge";
export type { StatusBadgeProps, FinancialStatus, StatusBadgeSize } from "./StatusBadge";

export { Spinner } from "./Spinner";
export type { SpinnerProps, SpinnerSize, SpinnerColor } from "./Spinner";

export { Skeleton } from "./Skeleton";
export type { SkeletonProps, SkeletonVariant } from "./Skeleton";

export { Divider } from "./Divider";
export type { DividerProps, DividerOrientation } from "./Divider";

export { Alert } from "./Alert";
export type { AlertProps, AlertVariant } from "./Alert";

export { EmptyState } from "./EmptyState";
export type { EmptyStateProps } from "./EmptyState";

export { ErrorState } from "./ErrorState";
export type { ErrorStateProps } from "./ErrorState";

export { OfflineState } from "./OfflineState";
export type { OfflineStateProps } from "./OfflineState";

export { RetryPanel } from "./RetryPanel";
export type { RetryPanelProps } from "./RetryPanel";

export { ModalShell } from "./ModalShell";
export type { ModalShellProps, ModalSize } from "./ModalShell";

export { BottomSheet } from "./BottomSheet";
export type { BottomSheetProps } from "./BottomSheet";

export { Toast, ToastProvider, useToast } from "./Toast";
export type { ToastProps, ToastConfig, ToastVariant, ToastProviderProps } from "./Toast";

export { ListRow } from "./ListRow";
export type { ListRowProps } from "./ListRow";

// Fintech patterns
export { MoneyAmount } from "./patterns/MoneyAmount";
export type { MoneyAmountProps } from "./patterns/MoneyAmount";

export { BalanceDisplay } from "./patterns/BalanceDisplay";
export type { BalanceDisplayProps } from "./patterns/BalanceDisplay";

export { AccountSummary } from "./patterns/AccountSummary";
export type { AccountSummaryProps } from "./patterns/AccountSummary";

export { TransactionRow } from "./patterns/TransactionRow";
export type { TransactionRowProps } from "./patterns/TransactionRow";

export { QuotePanel } from "./patterns/QuotePanel";
export type { QuotePanelProps } from "./patterns/QuotePanel";

export { ExchangeRateDisclosure } from "./patterns/ExchangeRateDisclosure";
export type { ExchangeRateDisclosureProps } from "./patterns/ExchangeRateDisclosure";

export { FeeBreakdown } from "./patterns/FeeBreakdown";
export type { FeeBreakdownProps, FeeItem } from "./patterns/FeeBreakdown";

export { RecipientCard } from "./patterns/RecipientCard";
export type { RecipientCardProps } from "./patterns/RecipientCard";

export { DestinationSummary } from "./patterns/DestinationSummary";
export type { DestinationSummaryProps } from "./patterns/DestinationSummary";

export { TransferStatus } from "./patterns/TransferStatus";
export type { TransferStatusProps, TransferStatusValue } from "./patterns/TransferStatus";

export { TransferTimeline } from "./patterns/TransferTimeline";
export type { TransferTimelineProps, TimelineStep } from "./patterns/TransferTimeline";

export { TransferReceipt } from "./patterns/TransferReceipt";
export type { TransferReceiptProps } from "./patterns/TransferReceipt";

export { ConfirmationPanel } from "./patterns/ConfirmationPanel";
export type { ConfirmationPanelProps } from "./patterns/ConfirmationPanel";

export { StaleDataNotice } from "./patterns/StaleDataNotice";
export type { StaleDataNoticeProps } from "./patterns/StaleDataNotice";

export { ServiceUnavailablePanel } from "./patterns/ServiceUnavailablePanel";
export type { ServiceUnavailablePanelProps } from "./patterns/ServiceUnavailablePanel";
