import { cn } from "@/lib/utils";

interface SamraLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  showWordmark?: boolean;
}

export function SamraLogo({ className, size = "md", showWordmark = true }: SamraLogoProps) {
  const sizeClasses = {
    sm: "text-xl",
    md: "text-2xl",
    lg: "text-4xl",
    xl: "text-5xl",
  };

  return (
    <div className={cn("flex items-center", className)}>
      {showWordmark ? (
        <div className={cn("flex items-baseline leading-none py-1", sizeClasses[size])}>
          <span className="font-sans font-[800] tracking-tighter lowercase text-[#F9F7F1]">samra</span>
          <span className="font-serif italic font-medium lowercase text-primary ml-[0.15em] tracking-tight">pay</span>
        </div>
      ) : (
        <div className={cn("flex items-baseline leading-none py-1", sizeClasses[size])}>
          <span className="font-sans font-[800] tracking-tighter lowercase text-[#F9F7F1]">s</span>
          <span className="font-serif italic font-medium lowercase text-primary ml-[0.05em]">p</span>
        </div>
      )}
    </div>
  );
}