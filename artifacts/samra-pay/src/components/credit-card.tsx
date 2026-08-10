import { cn } from "@/lib/utils";
import ethiopianLogo from "@/assets/ethiopian-airlines-logo.svg";
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from "framer-motion";
import { MouseEvent, ReactNode, useState } from "react";
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
  showFlipHint?: boolean;
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

// Hologram-style Mastercard detail for the card back
const HologramPatch = () => (
  <div className="relative w-[clamp(2rem,10cqw,2.75rem)] h-[clamp(1.4rem,7cqw,1.9rem)] rounded-[4px] overflow-hidden border border-white/20 shrink-0"
    style={{
      background: "conic-gradient(from 210deg at 50% 50%, #f6d365, #96e6a1, #84fab0, #a1c4fd, #c2e9fb, #fbc2eb, #f6d365)",
      opacity: 0.85,
    }}
  >
    <div className="absolute inset-0 mix-blend-overlay" style={{ backgroundImage: noisePattern }} />
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="flex items-center scale-[0.55]">
        <div className="w-4 h-4 rounded-full bg-[#EB001B]/70 -mr-1.5" />
        <div className="w-4 h-4 rounded-full bg-[#F79E1B]/70" />
      </div>
    </div>
    <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/40 to-transparent" />
  </div>
);

interface BackTheme {
  bgClass: string;
  shadowClass: string;
  stripeClass: string;
  textClass: string;
  subTextClass: string;
  issuerLine: string;
}

const backThemes: Record<CreditCardProps["variant"], BackTheme> = {
  charge: {
    bgClass: "bg-gradient-to-br from-[#0C1D13] via-[#1B3B2B] to-[#14301F]",
    shadowClass: "shadow-[0_20px_50px_-12px_rgba(27,59,43,0.8),inset_0_1px_1px_rgba(255,255,255,0.05)]",
    stripeClass: "bg-gradient-to-b from-[#0b0b0e] via-[#1c1c22] to-[#0b0b0e]",
    textClass: "text-white/80",
    subTextClass: "text-white/40",
    issuerLine: "Samra Pay Charge · Issued by Samra Financial S.C., Addis Ababa",
  },
  airlines: {
    bgClass: "bg-gradient-to-br from-[#b38b22] via-[#D4AF37] to-[#E6C27A]",
    shadowClass: "shadow-[0_20px_50px_-12px_rgba(212,175,55,0.5),inset_0_1px_1px_rgba(255,255,255,0.4)]",
    stripeClass: "bg-gradient-to-b from-[#141210] via-[#26221c] to-[#141210]",
    textClass: "text-black/75",
    subTextClass: "text-black/50",
    issuerLine: "Samra Pay × Ethiopian Airlines · Issued by Samra Financial S.C.",
  },
  debit: {
    bgClass: "bg-gradient-to-tr from-[#1A1A24] via-[#2D2D3F] to-[#1A1A24]",
    shadowClass: "shadow-[0_20px_50px_-12px_rgba(45,45,63,0.4),inset_0_1px_1px_rgba(255,255,255,0.15)]",
    stripeClass: "bg-gradient-to-b from-[#0b0b0e] via-[#1c1c22] to-[#0b0b0e]",
    textClass: "text-white/80",
    subTextClass: "text-white/40",
    issuerLine: "Samra Pay Debit · Issued by Samra Financial S.C., Addis Ababa",
  },
};

function CardBack({ variant, last4 }: { variant: CreditCardProps["variant"]; last4: string }) {
  const t = backThemes[variant];
  const isGold = variant === "airlines";

  return (
    <div className={cn(
      "@container absolute inset-0 rounded-[clamp(1rem,4cqw,1.25rem)] overflow-hidden flex flex-col border border-white/10",
      t.bgClass,
      t.shadowClass,
    )}>
      {/* Texture layers */}
      <div className="absolute inset-0 mix-blend-overlay pointer-events-none" style={{ backgroundImage: noisePattern }} />
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: axumPattern, backgroundSize: '60px' }} />

      {/* Magnetic stripe */}
      <div className={cn("relative z-10 h-[18%] mt-[9%] w-full", t.stripeClass)}>
        <div className="absolute inset-x-0 top-0 h-[1px] bg-white/10" />
        <div className="absolute inset-x-0 bottom-0 h-[1px] bg-black/40" />
      </div>

      {/* Signature panel + CVV */}
      <div className="relative z-10 px-[clamp(0.75rem,4cqw,1.5rem)] mt-[clamp(0.5rem,3.5cqw,1rem)]">
        <div className="flex items-stretch gap-[clamp(0.375rem,2cqw,0.625rem)]">
          <div className="flex-1 h-[clamp(1.5rem,9cqw,2.25rem)] rounded-[3px] overflow-hidden relative bg-[#f4f1e8]"
            style={{
              backgroundImage: "repeating-linear-gradient(0deg, transparent 0px, transparent 5px, rgba(0,0,0,0.06) 5px, rgba(0,0,0,0.06) 6px)",
            }}
          >
            {/* AUTHORIZED SIGNATURE microtext */}
            <div className="absolute top-[2px] left-[6px] text-[clamp(4px,1.4cqw,5px)] tracking-[0.2em] text-black/30 uppercase">Authorized Signature</div>
            <div className="absolute inset-0 flex items-center pl-[clamp(0.5rem,3cqw,1rem)]">
              <span className="font-serif italic text-black/70 text-[clamp(0.65rem,4cqw,1rem)] leading-none" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                Selam T.
              </span>
            </div>
          </div>
          <div className="w-[clamp(2.25rem,13cqw,3.25rem)] h-[clamp(1.5rem,9cqw,2.25rem)] rounded-[3px] bg-white/90 flex flex-col items-center justify-center gap-[1px] shrink-0">
            <span className="text-[clamp(4px,1.4cqw,5px)] tracking-[0.15em] text-black/40 uppercase">CVV</span>
            <span className="font-mono text-black/80 text-[clamp(0.6rem,3.2cqw,0.8rem)] leading-none tracking-widest">•••</span>
          </div>
        </div>
        <div className={cn("mt-[clamp(2px,1cqw,4px)] font-mono text-[clamp(0.5rem,2.4cqw,0.65rem)] tracking-[0.2em]", t.subTextClass)}>
          •••• {last4}
        </div>
      </div>

      {/* Legal microcopy + hologram */}
      <div className="relative z-10 mt-auto px-[clamp(0.75rem,4cqw,1.5rem)] pb-[clamp(0.625rem,3.5cqw,1.125rem)] flex items-end justify-between gap-[clamp(0.5rem,3cqw,1rem)]">
        <div className="min-w-0">
          <p className={cn("text-[clamp(4.5px,1.6cqw,6.5px)] leading-[1.5] max-w-full", t.subTextClass)}>
            This card is the property of the issuer and must be returned upon request. Use is subject to the cardholder agreement. If found, please return to any Samra Pay branch. Not transferable.
          </p>
          <p className={cn("mt-[clamp(2px,1cqw,4px)] text-[clamp(5px,1.8cqw,7px)] tracking-wider uppercase font-medium", t.textClass)}>
            {t.issuerLine}
          </p>
        </div>
        <div className="flex flex-col items-end gap-[clamp(2px,1cqw,4px)] shrink-0">
          <HologramPatch />
          <span className={cn("text-[clamp(4.5px,1.6cqw,6px)] tracking-widest uppercase", isGold ? "text-black/50" : "text-white/40")}>Mastercard</span>
        </div>
      </div>
    </div>
  );
}

export function CreditCard({ variant, cardholderName = "SELAM T.", last4 = "4242", expiry = "08/29", className, showFlipHint = false }: CreditCardProps) {
  const [flipped, setFlipped] = useState(false);
  const [hasFlipped, setHasFlipped] = useState(false);

  const toggleFlip = () => {
    setFlipped((f) => !f);
    setHasFlipped(true);
  };

  const CardBase = ({ children, bgClass, shadowClass }: { children: ReactNode, bgClass: string, shadowClass: string }) => (
    <div className={cn(
      "@container absolute inset-0 rounded-[clamp(1rem,4cqw,1.25rem)] overflow-hidden p-[clamp(1rem,4cqw,1.5rem)] flex flex-col justify-between border border-white/10 transition-shadow duration-500",
      bgClass,
      shadowClass,
    )}>
      {/* Texture layers */}
      <div className="absolute inset-0 mix-blend-overlay pointer-events-none" style={{ backgroundImage: noisePattern }} />
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: axumPattern, backgroundSize: '60px' }} />
      
      {children}
    </div>
  );

  const embossedText = "drop-shadow-[1px_1px_0px_rgba(255,255,255,0.15)] drop-shadow-[-1px_-1px_0px_rgba(0,0,0,0.8)]";

  let front: ReactNode;

  if (variant === "airlines") {
    const embossedTextGold = "drop-shadow-[1px_1px_0px_rgba(255,255,255,0.4)] drop-shadow-[-1px_-1px_0px_rgba(0,0,0,0.2)]";

    front = (
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
  } else if (variant === "charge") {
    front = (
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
  } else {
    front = (
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

  return (
    <div
      className={cn("relative w-full aspect-[1.586/1] perspective-[1500px] cursor-pointer select-none", className)}
      onClick={toggleFlip}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleFlip();
        }
      }}
      role="button"
      tabIndex={0}
      aria-pressed={flipped}
      aria-label={flipped ? "Show card front" : "Show card back"}
    >
      <motion.div
        className="relative w-full h-full"
        style={{ transformStyle: "preserve-3d" }}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.7, ease: [0.32, 0.72, 0.25, 1] }}
      >
        <div className="absolute inset-0" style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}>
          {front}
        </div>
        <div className="absolute inset-0" style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
          <CardBack variant={variant} last4={last4} />
        </div>
      </motion.div>

      {/* Subtle "tap to flip" hint — shown until the first flip */}
      {showFlipHint && (
        <AnimatePresence>
          {!hasFlipped && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4, transition: { delay: 0, duration: 0.3 } }}
              transition={{ delay: 1.2, duration: 0.6 }}
              className="absolute -bottom-9 left-1/2 -translate-x-1/2 z-30 pointer-events-none"
              aria-hidden="true"
            >
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.04] backdrop-blur-sm text-[11px] tracking-[0.18em] uppercase text-white/50 whitespace-nowrap">
                <motion.svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="w-3.5 h-3.5 text-primary/70"
                  animate={{ rotateY: [0, 180, 180, 0] }}
                  transition={{ duration: 3, repeat: Infinity, repeatDelay: 1.5, ease: "easeInOut" }}
                >
                  <rect x="3" y="6" width="18" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M3 10h18" stroke="currentColor" strokeWidth="1.5" />
                </motion.svg>
                Tap to flip
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}
