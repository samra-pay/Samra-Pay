import { cn } from "@/lib/utils";

interface SamraLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  showWordmark?: boolean;
  theme?: "dark" | "light";
}

export function SamraLogo({ className, size = "md", showWordmark = true, theme = "dark" }: SamraLogoProps) {
  const sizeClasses = {
    sm: "text-xl",
    md: "text-2xl",
    lg: "text-4xl",
    xl: "text-5xl",
  };

  const textSamra = theme === "light" ? "text-[#1A1A1A]" : "text-[#F9F7F1]";
  const textPay = theme === "light" ? "text-[#0A0A0A]" : "text-primary";

  return (
    <div className={cn("flex items-center", className)}>
      {showWordmark ? (
        <div className={cn("flex items-baseline leading-none py-1", sizeClasses[size])}>
          <span className={cn("font-sans font-[800] tracking-tighter lowercase", textSamra)}>samra</span>
          <span className={cn("font-serif italic font-medium lowercase ml-[0.15em] tracking-tight", textPay)}>pay</span>
        </div>
      ) : (
        <div className={cn("flex items-baseline leading-none py-1", sizeClasses[size])}>
          <span className={cn("font-sans font-[800] tracking-tighter lowercase", textSamra)}>s</span>
          <span className={cn("font-serif italic font-medium lowercase ml-[0.05em]", textPay)}>p</span>
        </div>
      )}
    </div>
  );
}