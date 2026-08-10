import { cn } from "@/lib/utils";

interface SamraLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  showWordmark?: boolean;
}

export function SamraLogo({ className, size = "md", showWordmark = false }: SamraLogoProps) {
  const sizeClasses = {
    sm: "w-6 h-6",
    md: "w-8 h-8",
    lg: "w-12 h-12",
    xl: "w-16 h-16",
  };

  const wordmarkClasses = {
    sm: "text-lg",
    md: "text-xl",
    lg: "text-3xl",
    xl: "text-4xl",
  };

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className={cn("relative flex items-center justify-center text-primary shrink-0", sizeClasses[size])}>
        <svg 
          viewBox="0 0 100 100" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg" 
          className="w-full h-full drop-shadow-[0_0_8px_rgba(212,175,55,0.4)]"
        >
          {/* Axumite stelae / geometric lattice S concept */}
          <path 
            d="M50 5 L50 20 M50 80 L50 95" 
            stroke="currentColor" 
            strokeWidth="8" 
            strokeLinecap="square"
          />
          <path 
            d="M25 20 H75 L75 45 H50 L25 45 V20 Z" 
            stroke="currentColor" 
            strokeWidth="8" 
            strokeLinejoin="miter"
          />
          <path 
            d="M75 80 H25 L25 55 H50 L75 55 V80 Z" 
            stroke="currentColor" 
            strokeWidth="8" 
            strokeLinejoin="miter"
          />
          {/* Inner decorative cuts for complexity */}
          <path d="M40 30 H60 M40 70 H60" stroke="currentColor" strokeWidth="4" />
        </svg>
      </div>
      {showWordmark && (
        <span className={cn("font-serif tracking-wide font-medium whitespace-nowrap", wordmarkClasses[size])}>
          SAMRA PAY
        </span>
      )}
    </div>
  );
}
