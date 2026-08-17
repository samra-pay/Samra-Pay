// Scene 1: The Pour — Opening title scene with Jebena pour
// Duration: 5000ms

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene1Pour() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2200),
      setTimeout(() => setPhase(4), 3800),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Background: Jebena pour image, full bleed */}
      <motion.div
        className="absolute inset-0"
        initial={{ scale: 1.12 }}
        animate={{ scale: phase >= 1 ? 1.04 : 1.12 }}
        transition={{ duration: 5, ease: [0.16, 1, 0.3, 1] }}
      >
        <img
          src={`${import.meta.env.BASE_URL}images/tomoca-pour-luxe.jpg`}
          alt=""
          className="w-full h-full object-cover object-center"
          style={{ filter: 'brightness(0.45) saturate(0.8)' }}
        />
      </motion.div>

      {/* Warm vignette overlay */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 30%, rgba(18,13,6,0.85) 100%)',
        }}
      />

      {/* Bottom gradient — blend into dark */}
      <div
        className="absolute bottom-0 left-0 right-0 h-2/5"
        style={{ background: 'linear-gradient(to top, #120D06 0%, transparent 100%)' }}
      />

      {/* Gold horizontal rule — draws in */}
      <motion.div
        className="absolute"
        style={{ top: '42%', left: '8%', right: '8%', height: '1px', background: 'var(--gold)', transformOrigin: 'left center' }}
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: phase >= 2 ? 1 : 0, opacity: phase >= 2 ? 0.6 : 0 }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Amharic intro — ሳምራ */}
      <motion.div
        className="absolute"
        style={{ top: '32%', left: '8%' }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: phase >= 1 ? 0.75 : 0, y: phase >= 1 ? 0 : 10 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      >
        <span
          className="font-ethiopic text-sm tracking-widest uppercase"
          style={{ color: 'var(--gold)', letterSpacing: '0.3em', fontSize: '0.75rem' }}
        >
          ሳምራ ፔይ
        </span>
      </motion.div>

      {/* Main headline */}
      <motion.div
        className="absolute"
        style={{ top: '44%', left: '8%', right: '20%' }}
      >
        <motion.h1
          className="font-display"
          style={{
            fontSize: 'clamp(2.8rem, 7vw, 6rem)',
            fontWeight: 500,
            fontStyle: 'italic',
            color: 'var(--cream)',
            lineHeight: 1.1,
            letterSpacing: '-0.01em',
          }}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: phase >= 2 ? 1 : 0, y: phase >= 2 ? 0 : 30 }}
          transition={{ duration: 1.0, ease: [0.16, 1, 0.3, 1] }}
        >
          One financial home.
        </motion.h1>

        <motion.p
          className="font-body"
          style={{
            fontSize: 'clamp(0.9rem, 1.8vw, 1.25rem)',
            color: 'rgba(245,240,232,0.65)',
            marginTop: '1rem',
            fontWeight: 300,
            letterSpacing: '0.05em',
          }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: phase >= 3 ? 1 : 0, y: phase >= 3 ? 0 : 20 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          Here and home in Ethiopia.
        </motion.p>
      </motion.div>

      {/* Gold accent dot — bottom right */}
      <motion.div
        className="absolute"
        style={{ bottom: '8%', right: '8%', width: 8, height: 8, borderRadius: '50%', background: 'var(--gold)' }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: phase >= 4 ? 1 : 0, opacity: phase >= 4 ? 1 : 0 }}
        transition={{ duration: 0.4, ease: [0.34, 1.3, 0.64, 1] }}
      />
    </motion.div>
  );
}
