import type { ReactNode } from "react";
import {
  BankCard,
  Card3DWrapper as DSCard3DWrapper,
  type BankCardVariant,
} from "@workspace/samra-pay-ds/components/patterns/bank-card";
import ethiopianLogo from "@/assets/ethiopian-airlines-logo.svg";

/**
 * Pointer-tilt + glare wrapper. Re-exported from the design system so existing
 * callers keep a stable local import path.
 */
export function Card3DWrapper({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <DSCard3DWrapper className={className}>{children}</DSCard3DWrapper>;
}

/**
 * App-specific card variant. Samra Pay's "airlines" card is the design system's
 * generic "co-brand" variant with the Ethiopian Airlines mark dropped into the
 * co-brand slot; every other variant maps straight through to the DS pattern.
 */
type CreditCardVariant = "charge" | "airlines" | "debit";

interface CreditCardProps {
  variant: CreditCardVariant;
  cardholderName?: string;
  last4?: string;
  expiry?: string;
  className?: string;
  showFlipHint?: boolean;
}

export function CreditCard({ variant, ...rest }: CreditCardProps) {
  if (variant === "airlines") {
    return (
      <BankCard
        variant="co-brand"
        coBrandSlot={
          <img
            src={ethiopianLogo}
            alt="Ethiopian Airlines"
            data-testid="ethiopian-airlines-logo"
            className="h-[clamp(1.5rem,7.5cqw,2.5rem)] w-[clamp(5.5rem,31cqw,8.5rem)] object-contain object-right"
          />
        }
        {...rest}
      />
    );
  }

  return <BankCard variant={variant as BankCardVariant} {...rest} />;
}
