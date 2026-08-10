import { cn } from "@/lib/utils";
import ethiopianLogo from "@/assets/ethiopian-airlines-logo.svg";

interface CreditCardProps {
  variant: "charge" | "airlines" | "debit";
  cardholderName?: string;
  last4?: string;
  className?: string;
}

export function CreditCard({ variant, cardholderName = "SELAM T.", last4 = "4242", className }: CreditCardProps) {
  if (variant === "airlines") {
    return (
      <div className={cn("relative w-full aspect-[1.586/1] rounded-2xl overflow-hidden shadow-2xl p-6 flex flex-col justify-between bg-gradient-to-br from-[#1A251E] via-[#0D1510] to-black border border-primary/30", className)}>
        {/* Glow effect */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/20 blur-3xl rounded-full" />
        
        <div className="relative z-10 flex justify-between items-start">
          <span className="font-serif text-primary text-xl font-medium tracking-wide">SAMRA PAY</span>
          <img src={ethiopianLogo} alt="Ethiopian Airlines" className="h-6 object-contain opacity-90 brightness-0 invert" />
        </div>
        
        <div className="relative z-10 space-y-4">
          <div className="w-10 h-7 rounded bg-gradient-to-br from-gray-300 to-gray-500 opacity-80" />
          <div className="font-mono text-primary/90 text-lg sm:text-xl tracking-[0.25em]">•••• •••• •••• {last4}</div>
          <div className="flex justify-between items-end">
            <div className="font-mono text-white/90 text-sm tracking-widest uppercase">{cardholderName}</div>
            <div className="text-white/50 text-[10px] uppercase tracking-widest text-right leading-tight">
              <span className="block">Co-Branded</span>
              <span>Premium</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (variant === "charge") {
    return (
      <div className={cn("relative w-full aspect-[1.586/1] rounded-2xl overflow-hidden shadow-2xl p-6 flex flex-col justify-between bg-[#0a0a0a] border border-white/10", className)}>
        {/* Metal texture overlay */}
        <div className="absolute inset-0 opacity-[0.03] mix-blend-overlay" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }} />
        
        <div className="relative z-10 flex justify-between items-start">
          <span className="font-serif text-white/90 text-xl font-medium tracking-wide">SAMRA PAY</span>
          <span className="text-white/40 text-xs font-medium tracking-widest uppercase border border-white/20 px-2 py-1 rounded-sm">Charge</span>
        </div>
        
        <div className="relative z-10 space-y-4">
          <div className="w-10 h-7 rounded bg-gradient-to-br from-gray-300 to-gray-500 opacity-80" />
          <div className="font-mono text-white/90 text-lg sm:text-xl tracking-[0.25em]">•••• •••• •••• {last4}</div>
          <div className="flex justify-between items-end">
            <div className="font-mono text-white/90 text-sm tracking-widest uppercase">{cardholderName}</div>
            <div className="text-white/40 text-xs italic font-serif">Member since '24</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative w-full aspect-[1.586/1] rounded-2xl overflow-hidden shadow-2xl p-6 flex flex-col justify-between bg-gradient-to-tr from-gray-900 to-gray-800 border border-white/10", className)}>
      <div className="relative z-10 flex justify-between items-start">
        <span className="font-serif text-white/90 text-xl font-medium tracking-wide">SAMRA PAY</span>
        <span className="text-white/40 text-xs font-medium tracking-widest uppercase">Debit</span>
      </div>
      
      <div className="relative z-10 space-y-4">
        <div className="w-10 h-7 rounded bg-gradient-to-br from-gray-300 to-gray-500 opacity-80" />
        <div className="font-mono text-white/90 text-lg sm:text-xl tracking-[0.25em]">•••• •••• •••• {last4}</div>
        <div className="flex justify-between items-end">
          <div className="font-mono text-white/90 text-sm tracking-widest uppercase">{cardholderName}</div>
        </div>
      </div>
    </div>
  );
}
