// Scene 3: Home — Ethiopia / family connection
// Duration: 8000ms

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene3Home() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1000),
      setTimeout(() => setPhase(3), 2000),
      setTimeout(() => setPhase(4), 3200),
      setTimeout(() => setPhase(5), 5800),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 overflow-hidden"
      style={{ background: '#120D06' }}
      initial={{ clipPath: 'circle(0% at 10% 90%)' }}
      animate={{ clipPath: 'circle(150% at 10% 90%)' }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Background photo — home ceremony (left panel) */}
      <motion.div
        className="absolute"
        style={{ top: 0, left: 0, width: '55%', height: '100%' }}
        initial={{ scale: 1.1 }}
        animate={{ scale: phase >= 1 ? 1.02 : 1.1 }}
        transition={{ duration: 6, ease: 'linear' }}
      >
        <img
          src={`${import.meta.env.BASE_URL}images/home-ceremony.jpg`}
          alt=""
          className="w-full h-full object-cover object-right"
          style={{ filter: 'brightness(0.5) saturate(0.9) sepia(0.1)' }}
        />
        {/* Left vignette blend */}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to left, #120D06 0%, transparent 40%)' }}
        />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to top, #120D06 0%, transparent 55%)' }}
        />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, #120D06 0%, transparent 30%)' }}
        />
      </motion.div>

      {/* Addis Ababa night street — subtle blend in right panel */}
      <motion.div
        className="absolute"
        style={{ top: 0, right: 0, width: '45%', height: '100%', mixBlendMode: 'luminosity' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: phase >= 1 ? 0.12 : 0 }}
        transition={{ duration: 2 }}
      >
        <img
          src={`${import.meta.env.BASE_URL}images/addis-night-street.jpg`}
          alt=""
          className="w-full h-full object-cover"
        />
      </motion.div>

      {/* Vertical gold separator line */}
      <motion.div
        className="absolute"
        style={{ top: '15%', bottom: '15%', left: '54%', width: '1px', background: 'linear-gradient(to bottom, transparent, var(--gold), transparent)', transformOrigin: 'top center' }}
        initial={{ scaleY: 0, opacity: 0 }}
        animate={{ scaleY: phase >= 2 ? 1 : 0, opacity: phase >= 2 ? 0.45 : 0 }}
        transition={{ duration: 1.0, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Right side: text content */}
      <div className="absolute" style={{ top: '50%', transform: 'translateY(-50%)', right: '6%', left: '58%' }}>
        {/* Amharic label */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: phase >= 1 ? 1 : 0, x: phase >= 1 ? 0 : 20 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <span
            className="font-ethiopic"
            style={{ color: 'var(--gold)', fontSize: '0.85rem', letterSpacing: '0.1em', display: 'block', marginBottom: '0.25rem' }}
          >
            ቤት
          </span>
          <span
            className="font-body uppercase tracking-widest"
            style={{ color: 'rgba(201,154,46,0.7)', fontSize: '0.65rem', letterSpacing: '0.25em' }}
          >
            Your family home
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h2
          className="font-display"
          style={{
            fontSize: 'clamp(2rem, 4.5vw, 3.8rem)',
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
          Stay close<br />to home.
        </motion.h2>

        {/* Gold divider */}
        <motion.div
          style={{ width: 48, height: 2, background: 'var(--gold)', marginTop: '1.5rem', transformOrigin: 'left center' }}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: phase >= 3 ? 1 : 0, opacity: phase >= 3 ? 1 : 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        />

        {/* Features */}
        <motion.div
          style={{ marginTop: '1.5rem' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: phase >= 3 ? 1 : 0 }}
          transition={{ duration: 0.6 }}
        >
          {['Send to Ethiopia', 'Transparent pricing', 'Track every transfer'].map((item, i) => (
            <motion.div
              key={item}
              className="flex items-center gap-3"
              style={{ marginBottom: '0.75rem' }}
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: phase >= 3 ? 1 : 0, x: phase >= 3 ? 0 : 15 }}
              transition={{ duration: 0.5, delay: i * 0.15, ease: [0.16, 1, 0.3, 1] }}
            >
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)', flexShrink: 0 }} />
              <span className="font-body" style={{ color: 'rgba(245,240,232,0.8)', fontSize: 'clamp(0.75rem, 1.4vw, 0.95rem)', fontWeight: 300 }}>
                {item}
              </span>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* Transfer receipt card */}
      <motion.div
        className="absolute"
        style={{
          bottom: '12%',
          left: '5%',
          padding: '1rem 1.5rem',
          background: 'rgba(18, 13, 6, 0.9)',
          border: '1px solid rgba(201, 154, 46, 0.3)',
          borderRadius: 12,
          backdropFilter: 'blur(16px)',
          minWidth: 200,
        }}
        initial={{ opacity: 0, y: 30, scale: 0.9 }}
        animate={{ opacity: phase >= 4 ? 1 : 0, y: phase >= 4 ? 0 : 30, scale: phase >= 4 ? 1 : 0.9 }}
        transition={{ duration: 0.8, ease: [0.34, 1.3, 0.64, 1] }}
      >
        <div className="font-body" style={{ color: 'rgba(245,240,232,0.5)', fontSize: '0.65rem', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
          Sent to Addis Ababa
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
          <span className="font-display gold-text" style={{ fontSize: '1.6rem', fontWeight: 600 }}>Receive in</span>
          <span className="font-body" style={{ color: 'rgba(245,240,232,0.5)', fontSize: '0.8rem' }}>ETB</span>
        </div>
        <div className="font-body" style={{ color: 'rgba(76, 175, 80, 0.85)', fontSize: '0.7rem', marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#4CAF50' }} />
          Illustrative transfer
        </div>
      </motion.div>
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
