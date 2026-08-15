import { type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, Plane, TrendingUp } from "lucide-react";
import { cn } from "../../lib/utils";

export interface RewardCardProps {
  /** Loyalty program name, e.g. "ShebaMiles Rewards". */
  programName?: string;
  /** Points / miles balance (formatted string, e.g. "42,500"). */
  points?: string;
  /** Unit label after the balance, e.g. "miles". */
  unit?: string;
  /** Membership tier, e.g. "Gold". */
  tier?: string;
  /** Optional recent-earning note, e.g. "+1,240 earned this month". */
  earnedNote?: string;
  /** Optional goal progress (0–100) with a label. */
  goalLabel?: string;
  goalPercent?: number;
  goalCeilingLabel?: string;
  icon?: ReactNode;
  /** Optional call-to-action rendered as a footer link/button. */
  action?: { label: string; onClick?: () => void };
  className?: string;
}

/**
 * Signature gold-stripe reward composition. A tibeb/gold accent stripe crowns a
 * dark eucalyptus panel with the program balance, tier, an optional goal bar,
 * and an "Illustrative demo reward" disclaimer. Token-driven surfaces; honors
 * reduced motion for the ambient plane drift.
 */
export function RewardCard({
  programName = "ShebaMiles Rewards",
  points = "42,500",
  unit = "miles",
  tier = "Gold",
  earnedNote,
  goalLabel,
  goalPercent,
  goalCeilingLabel,
  icon,
  action,
  className,
}: RewardCardProps) {
  const prefersReducedMotion = useReducedMotion();
  const clampedPercent =
    typeof goalPercent === "number" ? Math.max(0, Math.min(100, goalPercent)) : undefined;

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-primary/20 bg-eucalyptus text-eucalyptus-foreground shadow-gold-sm",
        className,
      )}
    >
      {/* Gold accent stripe (tibeb weave) */}
      <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-primary via-primary/70 to-eucalyptus" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-3 pattern-tibeb opacity-70" aria-hidden="true" />

      {/* Ambient icon drift */}
      <motion.div
        className="pointer-events-none absolute -right-10 -top-10 text-primary/10"
        aria-hidden="true"
        animate={prefersReducedMotion ? undefined : { rotate: [43, 47, 43], x: [0, -6, 0] }}
        transition={prefersReducedMotion ? undefined : { duration: 12, repeat: Infinity, ease: "easeInOut" }}
      >
        {icon ?? <Plane className="h-52 w-52 rotate-45" />}
      </motion.div>

      <div className="relative z-10 flex flex-col gap-6 p-7">
        <div className="flex items-start justify-between gap-4">
          <span className="inline-block rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-primary">
            {programName}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            {tier} tier
          </span>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="leading-none">
            <span className="font-serif text-6xl text-primary drop-shadow-[0_0_15px_var(--color-primary)]">
              {points}
            </span>
            <span className="ml-3 text-lg font-medium text-primary/80">{unit}</span>
          </div>
          {earnedNote ? (
            <div className="inline-flex items-center gap-2 rounded-xl border border-primary/15 bg-primary/5 px-3 py-2 text-sm font-medium text-eucalyptus-foreground">
              <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
              {earnedNote}
            </div>
          ) : null}
        </div>

        {clampedPercent !== undefined ? (
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-medium uppercase tracking-widest">
              <span className="text-eucalyptus-foreground/80">{goalLabel ?? "Next goal"}</span>
              <span className="text-primary">{clampedPercent}%</span>
            </div>
            <div
              className="h-2.5 w-full overflow-hidden rounded-full border border-primary/15 bg-background/40"
              role="progressbar"
              aria-valuenow={clampedPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={goalLabel ?? "Reward goal progress"}
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary/80 to-primary shadow-gold-sm transition-[width] duration-gentle"
                style={{ width: `${clampedPercent}%` }}
              />
            </div>
            {goalCeilingLabel ? (
              <div className="flex justify-between text-xs text-eucalyptus-foreground/60">
                <span>0</span>
                <span>{goalCeilingLabel}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-eucalyptus-foreground/60">Illustrative demo reward</p>
          {action ? (
            <button
              type="button"
              onClick={action.onClick}
              className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-primary transition-all duration-standard hover:gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-eucalyptus"
            >
              {action.label}
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
