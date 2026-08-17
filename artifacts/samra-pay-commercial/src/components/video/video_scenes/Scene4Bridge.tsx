// Scene 4: The Bridge — Gold connecting line, split-world morphing, key brand proposition
// Duration: 10000ms

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene4Bridge() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2400),
      setTimeout(() => setPhase(4), 4000),
      setTimeout(() => setPhase(5), 6000),
      setTimeout(() => setPhase(6), 8000),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 overflow-hidden"
      style={{ background: '#120D06' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Left world: ceremony lounge (US-side elegance) */}
      <motion.div
        className="absolute"
        style={{ top: 0, left: 0, width: '50%', height: '100%' }}
        initial={{ clipPath: 'inset(0 100% 0 0)' }}
        animate={{ clipPath: phase >= 1 ? 'inset(0 0% 0 0)' : 'inset(0 100% 0 0)' }}
        transition={{ duration: 1.0, ease: [0.16, 1, 0.3, 1] }}
      >
        <img
          src={`${import.meta.env.BASE_URL}images/ceremony-lounge.jpg`}
          alt=""
          className="w-full h-full object-cover object-right"
          style={{ filter: 'brightness(0.35) saturate(0.7)' }}
        />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to right, #120D06 0%, transparent 30%, #12060614 80%, #120D06 100%)' }}
        />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, #120D06 0%, transparent 20%, transparent 80%, #120D06 100%)' }}
        />
      </motion.div>

      {/* Right world: home ceremony (Ethiopia side) */}
      <motion.div
        className="absolute"
        style={{ top: 0, right: 0, width: '50%', height: '100%' }}
        initial={{ clipPath: 'inset(0 0 0 100%)' }}
        animate={{ clipPath: phase >= 1 ? 'inset(0 0 0 0%)' : 'inset(0 0 0 100%)' }}
        transition={{ duration: 1.0, ease: [0.16, 1, 0.3, 1] }}
      >
        <img
          src={`${import.meta.env.BASE_URL}images/home-ceremony.jpg`}
          alt=""
          className="w-full h-full object-cover object-left"
          style={{ filter: 'brightness(0.35) saturate(0.7) sepia(0.1)' }}
        />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to left, #120D06 0%, transparent 30%, transparent 80%, #120D06 100%)' }}
        />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, #120D06 0%, transparent 20%, transparent 80%, #120D06 100%)' }}
        />
      </motion.div>

      {/* The Bridge: gold line traveling from left to right */}
      <motion.div
        className="absolute"
        style={{ top: '50%', left: 0, right: 0, height: '1px', transformOrigin: 'left center' }}
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: phase >= 2 ? 1 : 0, opacity: phase >= 2 ? 1 : 0 }}
        transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <div style={{ width: '100%', height: '100%', background: 'linear-gradient(to right, transparent 0%, var(--gold) 20%, var(--gold-light) 50%, var(--gold) 80%, transparent 100%)' }} />
      </motion.div>

      {/* Center: bridge glow orb */}
      <motion.div
        className="absolute"
        style={{
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 80,
          height: 80,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(201,154,46,0.4) 0%, transparent 70%)',
        }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: phase >= 2 ? 1 : 0, opacity: phase >= 2 ? 1 : 0 }}
        transition={{ duration: 0.8, ease: [0.34, 1.3, 0.64, 1] }}
      />

      {/* World labels */}
      <motion.div
        className="absolute font-body uppercase tracking-widest"
        style={{ top: '42%', left: '6%', color: 'rgba(201,154,46,0.7)', fontSize: '0.65rem', letterSpacing: '0.25em' }}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: phase >= 1 ? 1 : 0, x: phase >= 1 ? 0 : -20 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        Washington D.C.
      </motion.div>

      <motion.div
        className="absolute font-body uppercase tracking-widest"
        style={{ top: '42%', right: '6%', color: 'rgba(201,154,46,0.7)', fontSize: '0.65rem', letterSpacing: '0.25em', textAlign: 'right' }}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: phase >= 1 ? 1 : 0, x: phase >= 1 ? 0 : 20 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        Addis Ababa
      </motion.div>

      {/* Main message: stacked big type, center */}
      <div
        className="absolute"
        style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', zIndex: 10 }}
      >
        {/* Icon / mark */}
        <motion.div
          style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: phase >= 2 ? 1 : 0, opacity: phase >= 2 ? 1 : 0 }}
          transition={{ duration: 0.6, ease: [0.34, 1.3, 0.64, 1] }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: 'rgba(18,13,6,0.9)',
              border: '1.5px solid var(--gold)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <img
              src={`${import.meta.env.BASE_URL}images/icon-192.png`}
              alt="Samra Pay"
              style={{ width: 28, height: 28, objectFit: 'contain' }}
            />
          </div>
        </motion.div>

        {/* Three value props stagger in */}
        {[
          { text: 'Send money.', delay: 0 },
          { text: 'Save money.', delay: 0.25 },
          { text: 'Build wealth.', delay: 0.5 },
        ].map(({ text, delay }, i) => (
          <motion.div
            key={text}
            className="font-display"
            style={{
              fontSize: 'clamp(1.6rem, 3.5vw, 2.8rem)',
              fontWeight: 600,
              fontStyle: i === 2 ? 'italic' : 'normal',
              color: i === 2 ? 'var(--gold)' : 'var(--cream)',
              lineHeight: 1.15,
              whiteSpace: 'nowrap',
            }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: phase >= 3 ? 1 : 0, y: phase >= 3 ? 0 : 20 }}
            transition={{ duration: 0.8, delay: phase >= 3 ? delay : 0, ease: [0.16, 1, 0.3, 1] }}
          >
            {text}
          </motion.div>
        ))}
      </div>

      {/* Bottom connector: currency conversion display */}
      <motion.div
        className="absolute"
        style={{
          bottom: '10%',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: '1.5rem',
          padding: '0.8rem 2rem',
          background: 'rgba(18, 13, 6, 0.88)',
          border: '1px solid rgba(201, 154, 46, 0.3)',
          borderRadius: 100,
          backdropFilter: 'blur(12px)',
          whiteSpace: 'nowrap',
        }}
        initial={{ opacity: 0, y: 40, scale: 0.85 }}
        animate={{ opacity: phase >= 4 ? 1 : 0, y: phase >= 4 ? 0 : 40, scale: phase >= 4 ? 1 : 0.85 }}
        transition={{ duration: 0.8, ease: [0.34, 1.3, 0.64, 1] }}
      >
        <div style={{ textAlign: 'center' }}>
          <div className="font-body" style={{ color: 'rgba(245,240,232,0.5)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '0.15rem' }}>You send</div>
          <div className="font-display" style={{ color: 'var(--cream)', fontSize: '1.3rem', fontWeight: 600 }}>$200 USD</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: 24, height: 1, background: 'var(--gold)', opacity: 0.5 }} />
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gold)' }} />
          <div style={{ width: 24, height: 1, background: 'var(--gold)', opacity: 0.5 }} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <div className="font-body" style={{ color: 'rgba(245,240,232,0.5)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '0.15rem' }}>They receive</div>
          <div className="font-display gold-text" style={{ fontSize: '1.3rem', fontWeight: 600 }}>11,000 ETB</div>
        </div>
      </motion.div>

      {/* Subtle Ethiopian pattern overlay */}
      <motion.div
        className="absolute inset-0"
        style={{ pointerEvents: 'none', mixBlendMode: 'overlay' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: phase >= 1 ? 0.06 : 0 }}
        transition={{ duration: 2 }}
      >
        <img
          src={`${import.meta.env.BASE_URL}images/hero-bg.jpg`}
          alt=""
          className="w-full h-full object-cover"
        />
      </motion.div>
    </motion.div>
  );
}
