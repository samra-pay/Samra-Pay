import { cn } from "@/lib/utils";
import ethiopianLogo from "@/assets/ethiopian-airlines-logo.svg";
import { motion, useMotionValue, useTransform, useSpring } from "framer-motion";
import { MouseEvent, ReactNode } from "react";
import { SamraLogo } from "@/components/samra-logo";

export function Card3DWrapper({ children, className }: { children: ReactNode; className?: string }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const mouseXSpring = useSpring(x);
  const mouseYSpring = useSpring(y);

  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["15deg", "-15deg"]);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-15deg", "15deg"]);
  
  const glareX = useTransform(mouseXSpring, [-0.5, 0.5], ["100%", "0%"]);
  const glareY = useTransform(mouseYSpring, [-0.5, 0.5], ["100%", "0%"]);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const xPct = mouseX / width - 0.5;
    const yPct = mouseY / height - 0.5;
    x.set(xPct);
    y.set(yPct);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <div
      className={cn("relative perspective-[1500px]", className)}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <motion.div
        style={{
          rotateX,
          rotateY,
          transformStyle: "preserve-3d",
        }}
        className="w-full h-full relative"
      >
        {children}
        {/* Dynamic Glare Overlay */}
        <motion.div
          className="absolute inset-0 z-50 pointer-events-none rounded-2xl mix-blend-overlay opacity-50"
          style={{
            background: `radial-gradient(circle at calc(var(--glare-x, 50%)) calc(var(--glare-y, 50%)), rgba(255, 255, 255, 0.8) 0%, transparent 60%)`,
            // @ts-ignore
            "--glare-x": glareX,
            "--glare-y": glareY,
          }}
        />
      </motion.div>
    </div>
  );
}

interface CreditCardProps {
  variant: "charge" | "airlines" | "debit";
  cardholderName?: string;
  last4?: string;
  expiry?: string;
  className?: string;
}

// Axumite-inspired geometric pattern
const axumPattern = `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M20 0l5 15h15l-12 9 5 15-13-10-13 10 5-15-12-9h15z' fill='%23ffffff' fill-opacity='0.02' fill-rule='evenodd'/%3E%3C/svg%3E")`;

// Metallic noise for texture
const noisePattern = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.08' mix-blend-mode='overlay'/%3E%3C/svg%3E")`;

const EMVChip = () => (
  <div className="w-[clamp(2.5rem,10cqw,3rem)] h-[clamp(1.75rem,7cqw,2.125rem)] rounded-[4px] bg-gradient-to-br from-[#E6C27A] via-[#FFE29F] to-[#D4AF37] relative overflow-hidden shadow-[inset_0_0_2px_rgba(0,0,0,0.5)] border border-[#b38b22]/50 flex shrink-0">
    {/* EMV Contact lines */}
    <div className="absolute inset-0 border-[0.5px] border-black/10 rounded-[3px] m-[2px]" />
    <div className="absolute left-1/2 top-0 bottom-0 w-[0.5px] bg-black/10 -translate-x-1/2" />
    <div className="absolute top-1/3 left-0 right-0 h-[0.5px] bg-black/10" />
    <div className="absolute top-2/3 left-0 right-0 h-[0.5px] bg-black/10" />
    <div className="absolute left-1/4 top-0 bottom-0 w-[1px] bg-gradient-to-b from-transparent via-white/40 to-transparent" />
  </div>
);

const MastercardLogo = ({ isLight = false }: { isLight?: boolean }) => (
  <div className="flex items-center">
    <div className={cn("w-[clamp(1.5rem,8cqw,2rem)] h-[clamp(1.5rem,8cqw,2rem)] rounded-full bg-[#EB001B] opacity-90 -mr-[clamp(0.5rem,3cqw,0.75rem)]", !isLight && "mix-blend-screen")} />
    <div className={cn("w-[clamp(1.5rem,8cqw,2rem)] h-[clamp(1.5rem,8cqw,2rem)] rounded-full bg-[#F79E1B] opacity-90", !isLight && "mix-blend-screen")} />
  </div>
);

export function CreditCard({ variant, cardholderName = "SELAM T.", last4 = "4242", expiry = "08/29", className }: CreditCardProps) {
  
  const CardBase = ({ children, bgClass, shadowClass }: { children: ReactNode, bgClass: string, shadowClass: string }) => (
    <div className={cn(
      "@container relative w-full aspect-[1.586/1] rounded-[clamp(1rem,4cqw,1.25rem)] overflow-hidden p-[clamp(1rem,4cqw,1.5rem)] flex flex-col justify-between border border-white/10 transition-shadow duration-500",
      bgClass,
      shadowClass,
      className
    )}>
      {/* Texture layers */}
      <div className="absolute inset-0 mix-blend-overlay pointer-events-none" style={{ backgroundImage: noisePattern }} />
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: axumPattern, backgroundSize: '60px' }} />
      
      {children}
    </div>
  );

  const embossedText = "drop-shadow-[1px_1px_0px_rgba(255,255,255,0.15)] drop-shadow-[-1px_-1px_0px_rgba(0,0,0,0.8)]";

  if (variant === "airlines") {
    const embossedTextGold = "drop-shadow-[1px_1px_0px_rgba(255,255,255,0.4)] drop-shadow-[-1px_-1px_0px_rgba(0,0,0,0.2)]";

    return (
      <CardBase 
        bgClass="bg-gradient-to-br from-[#E6C27A] via-[#D4AF37] to-[#b38b22]"
        shadowClass="shadow-[0_20px_50px_-12px_rgba(212,175,55,0.5),inset_0_1px_1px_rgba(255,255,255,0.4)]"
      >
        {/* Soft highlight sweep */}
        <div className="absolute top-0 right-0 w-[150%] h-[150%] bg-gradient-to-bl from-white/20 via-transparent to-transparent -translate-y-1/4 translate-x-1/4 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex justify-between items-start">
          <SamraLogo size="sm" showWordmark={true} theme="light" />
          <img src={ethiopianLogo} alt="Ethiopian Airlines" className="h-[clamp(1.25rem,6cqw,2rem)] object-contain" />
        </div>
        
        <div className="relative z-10 space-y-[clamp(0.5rem,3cqw,1rem)] mt-auto">
          <div className="flex justify-between items-end">
            <EMVChip />
            <div className="w-[clamp(1.5rem,8cqw,2rem)] h-[clamp(1.5rem,8cqw,2rem)] opacity-60 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full text-black">
                <path d="M4 12a8 8 0 018-8m0 0a8 8 0 018 8m-8-8v16m-8-8a8 8 0 008 8m0 0a8 8 0 008-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
          <div className={cn("font-mono text-black/90 whitespace-nowrap text-[clamp(0.85rem,5cqw,1.5rem)]", embossedTextGold)} style={{ letterSpacing: 'clamp(0.1em, 0.5cqw, 0.25em)' }}>
            •••• •••• •••• {last4}
          </div>
          <div className="flex justify-between items-end">
            <div className="flex flex-col gap-[clamp(2px,1cqw,4px)]">
              <div className="flex items-center gap-[clamp(4px,2cqw,8px)]">
                <div className="text-[clamp(7px,2cqw,9px)] leading-[1.1] text-black/60 tracking-wider font-semibold">VALID<br/>THRU</div>
                <div className={cn("font-mono text-black/90 tracking-widest text-[clamp(0.7rem,3cqw,0.875rem)]", embossedTextGold)}>{expiry}</div>
              </div>
              <div className={cn("font-mono text-black/90 tracking-widest uppercase text-[clamp(0.7rem,3cqw,0.875rem)] overflow-hidden text-ellipsis max-w-[clamp(8rem,40cqw,14rem)]", embossedTextGold)}>{cardholderName}</div>
            </div>
            <MastercardLogo isLight={true} />
          </div>
        </div>
      </CardBase>
    );
  }

  if (variant === "charge") {
    return (
      <CardBase 
        bgClass="bg-gradient-to-br from-[#14301F] via-[#1B3B2B] to-[#0C1D13]"
        shadowClass="shadow-[0_20px_50px_-12px_rgba(27,59,43,0.8),inset_0_1px_1px_rgba(255,255,255,0.05)]"
      >
        {/* Subtle highlight sweep */}
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-tr from-white/[0.05] to-transparent pointer-events-none" />
        
        <div className="relative z-10 flex justify-between items-start">
          <SamraLogo size="sm" showWordmark={true} />
          <span className="text-white/40 text-[clamp(8px,2cqw,10px)] font-medium tracking-widest uppercase border border-white/20 px-[clamp(4px,1.5cqw,8px)] py-[clamp(2px,1cqw,4px)] rounded-[4px]">Charge</span>
        </div>
        
        <div className="relative z-10 space-y-[clamp(0.5rem,3cqw,1rem)] mt-auto">
          <div className="flex justify-between items-end">
            <EMVChip />
            <div className="w-[clamp(1.5rem,8cqw,2rem)] h-[clamp(1.5rem,8cqw,2rem)] opacity-80 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full text-white/50">
                <path d="M4 12a8 8 0 018-8m0 0a8 8 0 018 8m-8-8v16m-8-8a8 8 0 008 8m0 0a8 8 0 008-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
          <div className={cn("font-mono text-white/90 whitespace-nowrap text-[clamp(0.85rem,5cqw,1.5rem)]", embossedText)} style={{ letterSpacing: 'clamp(0.1em, 0.5cqw, 0.25em)' }}>
            •••• •••• •••• {last4}
          </div>
          <div className="flex justify-between items-end">
            <div className="flex flex-col gap-[clamp(2px,1cqw,4px)]">
              <div className="flex items-center gap-[clamp(4px,2cqw,8px)]">
                <div className="text-[clamp(7px,2cqw,9px)] leading-[1.1] text-white/60 tracking-wider font-semibold">VALID<br/>THRU</div>
                <div className={cn("font-mono text-white/90 tracking-widest text-[clamp(0.7rem,3cqw,0.875rem)]", embossedText)}>{expiry}</div>
              </div>
              <div className={cn("font-mono text-white/90 tracking-widest uppercase text-[clamp(0.7rem,3cqw,0.875rem)] overflow-hidden text-ellipsis max-w-[clamp(8rem,40cqw,14rem)]", embossedText)}>{cardholderName}</div>
            </div>
            <MastercardLogo />
          </div>
        </div>
      </CardBase>
    );
  }

  return (
    <CardBase 
      bgClass="bg-gradient-to-tr from-[#1A1A24] via-[#2D2D3F] to-[#1A1A24]"
      shadowClass="shadow-[0_20px_50px_-12px_rgba(45,45,63,0.4),inset_0_1px_1px_rgba(255,255,255,0.15)]"
    >
      <div className="relative z-10 flex justify-between items-start">
        <SamraLogo size="sm" showWordmark={true} />
        <span className="text-white/40 text-[clamp(8px,2cqw,10px)] font-medium tracking-widest uppercase">Debit</span>
      </div>
      
      <div className="relative z-10 space-y-[clamp(0.5rem,3cqw,1rem)] mt-auto">
        <div className="flex justify-between items-end">
          <EMVChip />
          <div className="w-[clamp(1.5rem,8cqw,2rem)] h-[clamp(1.5rem,8cqw,2rem)] opacity-80 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full text-white/50">
              <path d="M4 12a8 8 0 018-8m0 0a8 8 0 018 8m-8-8v16m-8-8a8 8 0 008 8m0 0a8 8 0 008-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
        <div className={cn("font-mono text-white/90 whitespace-nowrap text-[clamp(0.85rem,5cqw,1.5rem)]", embossedText)} style={{ letterSpacing: 'clamp(0.1em, 0.5cqw, 0.25em)' }}>
          •••• •••• •••• {last4}
        </div>
        <div className="flex justify-between items-end">
          <div className="flex flex-col gap-[clamp(2px,1cqw,4px)]">
            <div className="flex items-center gap-[clamp(4px,2cqw,8px)]">
              <div className="text-[clamp(7px,2cqw,9px)] leading-[1.1] text-white/60 tracking-wider font-semibold">VALID<br/>THRU</div>
              <div className={cn("font-mono text-white/90 tracking-widest text-[clamp(0.7rem,3cqw,0.875rem)]", embossedText)}>{expiry}</div>
            </div>
            <div className={cn("font-mono text-white/90 tracking-widest uppercase text-[clamp(0.7rem,3cqw,0.875rem)] overflow-hidden text-ellipsis max-w-[clamp(8rem,40cqw,14rem)]", embossedText)}>{cardholderName}</div>
          </div>
          <MastercardLogo />
        </div>
      </div>
    </CardBase>
  );
}
