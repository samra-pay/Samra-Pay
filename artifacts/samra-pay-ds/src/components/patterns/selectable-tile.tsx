import {
  type ComponentType,
  type KeyboardEvent,
  type ReactNode,
  createContext,
  useContext,
  useId,
} from "react";
import { Check } from "lucide-react";
import { cn } from "../../lib/utils";

interface TileGroupContext {
  name: string;
  value: string | undefined;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const GroupContext = createContext<TileGroupContext | null>(null);

export interface SelectableTileProps {
  /** Stable value for this tile; required inside a SelectableTileGroup. */
  value?: string;
  title: ReactNode;
  description?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  /** Standalone selected state (ignored when inside a group). */
  selected?: boolean;
  onSelect?: (value?: string) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Radio-semantics selection tile with an icon, title, and description.
 * Selected state = `border-primary` + `bg-accent` + a gold check badge. Inside
 * a `SelectableTileGroup` it participates in a roving radio group (arrow keys
 * move selection); standalone it behaves as a single toggle. Token-driven.
 */
export function SelectableTile({
  value,
  title,
  description,
  icon: Icon,
  selected,
  onSelect,
  disabled: disabledProp,
  className,
}: SelectableTileProps) {
  const group = useContext(GroupContext);
  const inGroup = group !== null;

  const isSelected = inGroup ? group.value === value : !!selected;
  const disabled = disabledProp || (inGroup ? group.disabled : false);

  const activate = () => {
    if (disabled) return;
    if (inGroup && value !== undefined) group.onChange(value);
    onSelect?.(value);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (!inGroup) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate();
      }
      return;
    }
    // Roving arrow-key navigation within a radiogroup.
    if (["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(e.key)) {
      e.preventDefault();
      const container = e.currentTarget.closest("[data-tile-group]");
      if (!container) return;
      const tiles = Array.from(
        container.querySelectorAll<HTMLButtonElement>('[role="radio"]:not([aria-disabled="true"])'),
      );
      const idx = tiles.indexOf(e.currentTarget);
      if (idx === -1) return;
      const forward = e.key === "ArrowRight" || e.key === "ArrowDown";
      const next = tiles[(idx + (forward ? 1 : -1) + tiles.length) % tiles.length];
      next?.focus();
      next?.click();
    }
  };

  return (
    <button
      type="button"
      role={inGroup ? "radio" : undefined}
      aria-checked={inGroup ? isSelected : undefined}
      aria-pressed={inGroup ? undefined : isSelected}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      tabIndex={inGroup ? (isSelected ? 0 : -1) : 0}
      onClick={activate}
      onKeyDown={handleKeyDown}
      className={cn(
        "group relative flex min-h-[96px] w-full flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all duration-standard",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        isSelected
          ? "border-primary bg-accent text-accent-foreground shadow-gold-sm"
          : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:bg-accent/40",
        disabled && "cursor-not-allowed opacity-50 hover:border-border hover:bg-card",
        className,
      )}
    >
      {isSelected ? (
        <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-gold-sm">
          <Check className="h-3 w-3" aria-hidden="true" />
        </span>
      ) : null}
      {Icon ? <Icon className={cn("h-5 w-5", isSelected ? "text-primary" : "text-muted-foreground")} /> : null}
      <span className={cn("text-sm font-medium leading-tight", isSelected ? "text-foreground" : "text-foreground/90")}>
        {title}
      </span>
      {description ? (
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{description}</span>
      ) : null}
    </button>
  );
}

export interface SelectableTileGroupProps {
  value?: string;
  onValueChange?: (value: string) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Radiogroup wrapper for a set of SelectableTiles. Single-select; keyboard
 * accessible with roving focus. Provide `value` + `onValueChange` for a
 * controlled group.
 */
export function SelectableTileGroup({
  value,
  onValueChange,
  label,
  disabled,
  className,
  children,
}: SelectableTileGroupProps) {
  const name = useId();
  const labelId = useId();

  return (
    <div
      data-tile-group=""
      role="radiogroup"
      aria-label={label ? undefined : "Select an option"}
      aria-labelledby={label ? labelId : undefined}
      className={cn("space-y-3", className)}
    >
      {label ? (
        <span id={labelId} className="block text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <GroupContext.Provider
          value={{
            name,
            value,
            onChange: (v) => onValueChange?.(v),
            disabled,
          }}
        >
          {children}
        </GroupContext.Provider>
      </div>
    </div>
  );
}
