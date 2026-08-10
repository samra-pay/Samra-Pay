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
  className?: string;
}

// Axumite-inspired geometric pattern
const axumPattern = `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M20 0l5 15h15l-12 9 5 15-13-10-13 10 5-15-12-9h15z' fill='%23ffffff' fill-opacity='0.02' fill-rule='evenodd'/%3E%3C/svg%3E")`;

// Metallic noise for texture
const noisePattern = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.08' mix-blend-mode='overlay'/%3E%3C/svg%3E")`;

const EMVChip = () => (
  <div className="w-12 h-[34px] rounded-[4px] bg-gradient-to-br from-[#E6C27A] via-[#FFE29F] to-[#D4AF37] relative overflow-hidden shadow-[inset_0_0_2px_rgba(0,0,0,0.5)] border border-[#b38b22]/50 flex shrink-0">
    {/* EMV Contact lines */}
    <div className="absolute inset-0 border-[0.5px] border-black/10 rounded-[3px] m-[2px]" />
    <div className="absolute left-1/2 top-0 bottom-0 w-[0.5px] bg-black/10 -translate-x-1/2" />
    <div className="absolute top-1/3 left-0 right-0 h-[0.5px] bg-black/10" />
    <div className="absolute top-2/3 left-0 right-0 h-[0.5px] bg-black/10" />
    <div className="absolute left-1/4 top-0 bottom-0 w-[1px] bg-gradient-to-b from-transparent via-white/40 to-transparent" />
  </div>
);

const MastercardLogo = () => (
  <div className="flex items-center">
    <div className="w-8 h-8 rounded-full bg-[#EB001B] opacity-90 mix-blend-screen -mr-3" />
    <div className="w-8 h-8 rounded-full bg-[#F79E1B] opacity-90 mix-blend-screen" />
  </div>
);

export function CreditCard({ variant, cardholderName = "SELAM T.", last4 = "4242", className }: CreditCardProps) {
  
  const CardBase = ({ children, bgClass, shadowClass }: { children: ReactNode, bgClass: string, shadowClass: string }) => (
    <div className={cn(
      "relative w-full aspect-[1.586/1] rounded-[1.25rem] overflow-hidden p-6 flex flex-col justify-between border border-white/10 transition-shadow duration-500",
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
    return (
      <CardBase 
        bgClass="bg-gradient-to-br from-[#12281C] via-[#0A120E] to-black"
        shadowClass="shadow-[0_20px_50px_-12px_rgba(27,59,43,0.5),inset_0_1px_1px_rgba(255,255,255,0.1)]"
      >
        {/* Soft gold sweep */}
        <div className="absolute top-0 right-0 w-[150%] h-[150%] bg-gradient-to-bl from-[#D4AF37]/10 via-transparent to-transparent -translate-y-1/4 translate-x-1/4 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex justify-between items-start">
          <SamraLogo size="sm" showWordmark={true} />
          <img src={ethiopianLogo} alt="Ethiopian Airlines" className="h-5 md:h-6 object-contain opacity-90 brightness-0 invert" />
        </div>
        
        <div className="relative z-10 space-y-5 mt-auto">
          <div className="flex justify-between items-end">
            <EMVChip />
            <div className="w-8 h-8 opacity-80 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full text-white/50">
                <path d="M4 12a8 8 0 018-8m0 0a8 8 0 018 8m-8-8v16m-8-8a8 8 0 008 8m0 0a8 8 0 008-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
          <div className={cn("font-mono text-white/90 text-lg md:text-2xl tracking-[0.2em] md:tracking-[0.25em]", embossedText)}>
            •••• •••• •••• {last4}
          </div>
          <div className="flex justify-between items-end">
            <div className={cn("font-mono text-white/90 text-sm tracking-widest uppercase", embossedText)}>{cardholderName}</div>
            <div className="flex items-center gap-4">
              <div className="text-white/50 text-[9px] md:text-[10px] uppercase tracking-widest text-right leading-tight">
                <span className="block text-primary/80">Co-Branded</span>
                <span>Premium</span>
              </div>
              <MastercardLogo />
            </div>
          </div>
        </div>
      </CardBase>
    );
  }

  if (variant === "charge") {
    return (
      <CardBase 
        bgClass="bg-[#050505]"
        shadowClass="shadow-[0_20px_50px_-12px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.05)]"
      >
        {/* Subtle charcoal sweep */}
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-tr from-white/[0.03] to-transparent pointer-events-none" />
        
        <div className="relative z-10 flex justify-between items-start">
          <SamraLogo size="sm" showWordmark={true} className="text-white" />
          <span className="text-white/40 text-[10px] font-medium tracking-widest uppercase border border-white/20 px-2 py-1 rounded-[4px]">Charge</span>
        </div>
        
        <div className="relative z-10 space-y-5 mt-auto">
          <div className="flex justify-between items-end">
            <EMVChip />
            <div className="w-8 h-8 opacity-80 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full text-white/50">
                <path d="M4 12a8 8 0 018-8m0 0a8 8 0 018 8m-8-8v16m-8-8a8 8 0 008 8m0 0a8 8 0 008-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
          <div className={cn("font-mono text-white/90 text-lg md:text-2xl tracking-[0.2em] md:tracking-[0.25em]", embossedText)}>
            •••• •••• •••• {last4}
          </div>
          <div className="flex justify-between items-end">
            <div className={cn("font-mono text-white/90 text-sm tracking-widest uppercase", embossedText)}>{cardholderName}</div>
            <div className="flex items-center gap-4">
              <div className="text-white/30 text-[10px] italic font-serif">Member since '24</div>
              <MastercardLogo />
            </div>
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
        <SamraLogo size="sm" showWordmark={true} className="text-white" />
        <span className="text-white/40 text-[10px] font-medium tracking-widest uppercase">Debit</span>
      </div>
      
      <div className="relative z-10 space-y-5 mt-auto">
        <div className="flex justify-between items-end">
          <EMVChip />
          <div className="w-8 h-8 opacity-80 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full text-white/50">
              <path d="M4 12a8 8 0 018-8m0 0a8 8 0 018 8m-8-8v16m-8-8a8 8 0 008 8m0 0a8 8 0 008-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
        <div className={cn("font-mono text-white/90 text-lg md:text-2xl tracking-[0.2em] md:tracking-[0.25em]", embossedText)}>
          •••• •••• •••• {last4}
        </div>
        <div className="flex justify-between items-end">
          <div className={cn("font-mono text-white/90 text-sm tracking-widest uppercase", embossedText)}>{cardholderName}</div>
          <MastercardLogo />
        </div>
      </div>
    </CardBase>
  );
}
