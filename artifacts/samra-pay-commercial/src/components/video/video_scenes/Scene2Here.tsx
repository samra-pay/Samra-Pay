// Scene 2: Here — Life in the diaspora, US side of the story
// Duration: 8000ms

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene2Here() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 900),
      setTimeout(() => setPhase(3), 1800),
      setTimeout(() => setPhase(4), 3000),
      setTimeout(() => setPhase(5), 5500),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 overflow-hidden"
      style={{ background: '#120D06' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ clipPath: 'circle(0% at 90% 10%)' }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Background photo — woman with phone (diaspora, warm city view) */}
      <motion.div
        className="absolute"
        style={{ top: 0, right: 0, width: '58%', height: '100%' }}
        initial={{ clipPath: 'inset(0 100% 0 0)', opacity: 0 }}
        animate={{
          clipPath: phase >= 1 ? 'inset(0 0% 0 0)' : 'inset(0 100% 0 0)',
          opacity: phase >= 1 ? 1 : 0,
        }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      >
        <img
          src={`${import.meta.env.BASE_URL}images/woman-with-phone-diaspora.jpg`}
          alt=""
          className="w-full h-full object-cover object-left"
          style={{ filter: 'brightness(0.55) saturate(0.9)' }}
        />
        {/* Right-side photo vignette */}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to right, #120D06 0%, transparent 40%)' }}
        />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to top, #120D06 0%, transparent 50%)' }}
        />
      </motion.div>

      {/* Vertical gold accent line */}
      <motion.div
        className="absolute"
        style={{ top: '10%', bottom: '10%', left: '42%', width: '1px', background: 'linear-gradient(to bottom, transparent, var(--gold), transparent)', transformOrigin: 'top center' }}
        initial={{ scaleY: 0, opacity: 0 }}
        animate={{ scaleY: phase >= 2 ? 1 : 0, opacity: phase >= 2 ? 0.5 : 0 }}
        transition={{ duration: 1.0, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Left side: text block */}
      <div className="absolute" style={{ top: '50%', transform: 'translateY(-50%)', left: '8%', right: '55%' }}>
        {/* Label */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: phase >= 1 ? 1 : 0, x: phase >= 1 ? 0 : -20 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <span
            className="font-body uppercase tracking-widest"
            style={{ color: 'var(--gold)', fontSize: '0.7rem', letterSpacing: '0.25em' }}
          >
            Your life here
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h2
          className="font-display"
          style={{
            fontSize: 'clamp(2.2rem, 5vw, 4.2rem)',
            fontWeight: 500,
            fontStyle: 'italic',
            color: 'var(--cream)',
            lineHeight: 1.1,
            marginTop: '0.75rem',
          }}
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: phase >= 2 ? 1 : 0, y: phase >= 2 ? 0 : 25 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        >
          Build your<br />future here.
        </motion.h2>

        {/* Gold divider */}
        <motion.div
          style={{ width: 48, height: 2, background: 'var(--gold)', marginTop: '1.5rem', transformOrigin: 'left center' }}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: phase >= 3 ? 1 : 0, opacity: phase >= 3 ? 1 : 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        />

        {/* Feature bullets */}
        <motion.div
          style={{ marginTop: '1.5rem' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: phase >= 3 ? 1 : 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          {['US bank account', 'Samra debit card', 'Earn rewards'].map((item, i) => (
            <motion.div
              key={item}
              className="flex items-center gap-3"
              style={{ marginBottom: '0.75rem' }}
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: phase >= 3 ? 1 : 0, x: phase >= 3 ? 0 : -15 }}
              transition={{ duration: 0.5, delay: i * 0.15, ease: [0.16, 1, 0.3, 1] }}
            >
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)', flexShrink: 0 }} />
              <span className="font-body" style={{ color: 'rgba(245,240,232,0.8)', fontSize: 'clamp(0.8rem, 1.5vw, 1rem)', fontWeight: 300 }}>
                {item}
              </span>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* Floating stat card */}
      <motion.div
        className="absolute"
        style={{
          bottom: '12%',
          right: '6%',
          padding: '1rem 1.5rem',
          background: 'rgba(18, 13, 6, 0.85)',
          border: '1px solid rgba(201, 154, 46, 0.35)',
          borderRadius: 12,
          backdropFilter: 'blur(12px)',
          minWidth: 180,
        }}
        initial={{ opacity: 0, y: 30, scale: 0.9 }}
        animate={{ opacity: phase >= 4 ? 1 : 0, y: phase >= 4 ? 0 : 30, scale: phase >= 4 ? 1 : 0.9 }}
        transition={{ duration: 0.8, ease: [0.34, 1.3, 0.64, 1] }}
      >
        <div className="font-body" style={{ color: 'rgba(245,240,232,0.5)', fontSize: '0.7rem', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
          Balance
        </div>
        <div className="font-display gold-shimmer" style={{ fontSize: '1.8rem', fontWeight: 600 }}>
          $4,250
        </div>
        <div className="font-body" style={{ color: 'rgba(201,154,46,0.7)', fontSize: '0.7rem', marginTop: '0.25rem' }}>
          Illustrative balance
        </div>
      </motion.div>

      {/* Exit clip overlay */}
      <motion.div
        className="absolute inset-0"
        style={{ background: '#120D06', pointerEvents: 'none' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: phase >= 5 ? 0 : 0 }}
      />
      {/* Always visible with the scene; never phase-gated with an amount. */}
      <p
        className="absolute font-body"
        style={{ top: '0.5rem', left: '20%', right: '20%', margin: 0, padding: '0.25rem', zIndex: 50, textAlign: 'center', fontSize: '1rem', lineHeight: 1.5, color: 'var(--cream)', background: 'var(--espresso)' }}
      >
        Illustrative. Not a rate quote or an offer.
      </p>
    </motion.div>
  );
}
