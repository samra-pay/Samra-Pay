// Scene 6: Brand Close — Logo reveal, Ethiopian pattern bg, tagline
// Duration: 8000ms

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene6Close() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2400),
      setTimeout(() => setPhase(4), 4000),
      setTimeout(() => setPhase(5), 6200),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 overflow-hidden"
      style={{ background: '#0D0905' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Ethiopian pattern background */}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0, scale: 1.05 }}
        animate={{ opacity: phase >= 1 ? 1 : 0, scale: phase >= 1 ? 1 : 1.05 }}
        transition={{ duration: 2, ease: 'easeOut' }}
      >
        <img
          src={`${import.meta.env.BASE_URL}images/hero-bg.jpg`}
          alt=""
          className="w-full h-full object-cover"
          style={{ filter: 'brightness(0.18) saturate(0.6)' }}
        />
      </motion.div>

      {/* Radial warm glow at center */}
      <motion.div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 60% 60% at center, rgba(201,154,46,0.08) 0%, transparent 70%)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: phase >= 1 ? 1 : 0 }}
        transition={{ duration: 1.5 }}
      />

      {/* Top gold line */}
      <motion.div
        className="absolute"
        style={{ top: '30%', left: '20%', right: '20%', height: '1px', background: 'linear-gradient(to right, transparent, var(--gold), transparent)', transformOrigin: 'center' }}
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: phase >= 2 ? 1 : 0, opacity: phase >= 2 ? 0.5 : 0 }}
        transition={{ duration: 1.0, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Bottom gold line */}
      <motion.div
        className="absolute"
        style={{ bottom: '30%', left: '20%', right: '20%', height: '1px', background: 'linear-gradient(to right, transparent, var(--gold), transparent)', transformOrigin: 'center' }}
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: phase >= 2 ? 1 : 0, opacity: phase >= 2 ? 0.5 : 0 }}
        transition={{ duration: 1.0, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
      />

      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {/* Amharic pre-label */}
        <motion.div
          className="font-ethiopic"
          style={{ color: 'rgba(201,154,46,0.65)', fontSize: '1rem', letterSpacing: '0.1em', marginBottom: '1.5rem' }}
          initial={{ opacity: 0, y: -15 }}
          animate={{ opacity: phase >= 2 ? 1 : 0, y: phase >= 2 ? 0 : -15 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          የፋይናንስ ቤትዎ
        </motion.div>

        {/* Logo */}
        <motion.div
          style={{ marginBottom: '1.5rem' }}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: phase >= 2 ? 1 : 0, scale: phase >= 2 ? 1 : 0.8 }}
          transition={{ duration: 1.0, ease: [0.34, 1.3, 0.64, 1] }}
        >
          <img
            src={`${import.meta.env.BASE_URL}images/logo.png`}
            alt="Samra Pay"
            style={{
              height: 'clamp(36px, 6vh, 60px)',
              objectFit: 'contain',
              filter: 'brightness(0) saturate(100%) invert(78%) sepia(35%) saturate(600%) hue-rotate(10deg)',
            }}
          />
        </motion.div>

        {/* Tagline */}
        <motion.p
          className="font-display"
          style={{
            fontSize: 'clamp(1.1rem, 2.5vw, 1.8rem)',
            fontWeight: 400,
            fontStyle: 'italic',
            color: 'var(--cream)',
            textAlign: 'center',
            letterSpacing: '0.01em',
            marginBottom: '0.5rem',
          }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: phase >= 3 ? 1 : 0, y: phase >= 3 ? 0 : 20 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        >
          Your financial home.
        </motion.p>

        <motion.p
          className="font-body"
          style={{
            fontSize: 'clamp(0.7rem, 1.4vw, 0.95rem)',
            color: 'rgba(245,240,232,0.45)',
            textAlign: 'center',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: phase >= 3 ? 1 : 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          Here and home in Ethiopia
        </motion.p>

        {/* Gold dot separator */}
        <motion.div
          style={{ display: 'flex', gap: '0.5rem', marginTop: '2rem', alignItems: 'center' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: phase >= 4 ? 1 : 0 }}
          transition={{ duration: 0.6 }}
        >
          <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(201,154,46,0.4)' }} />
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)' }} />
          <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(201,154,46,0.4)' }} />
        </motion.div>

        {/* App download cue (visual only) */}
        <motion.div
          style={{
            marginTop: '2rem',
            padding: '0.6rem 1.8rem',
            border: '1px solid rgba(201,154,46,0.35)',
            borderRadius: 100,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: phase >= 4 ? 1 : 0, y: phase >= 4 ? 0 : 20 }}
          transition={{ duration: 0.8, ease: [0.34, 1.3, 0.64, 1] }}
        >
          <span className="font-body" style={{ color: 'var(--gold)', fontSize: '0.75rem', letterSpacing: '0.1em' }}>
            samrapay.com
          </span>
        </motion.div>
      </div>

      {/* Subtle floating accent orbs */}
      <motion.div
        className="absolute"
        style={{
          top: '20%',
          left: '10%',
          width: 120,
          height: 120,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(201,154,46,0.08) 0%, transparent 70%)',
          animation: 'float 8s ease-in-out infinite',
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: phase >= 1 ? 1 : 0 }}
        transition={{ duration: 2 }}
      />
      <motion.div
        className="absolute"
        style={{
          bottom: '15%',
          right: '8%',
          width: 160,
          height: 160,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(201,154,46,0.06) 0%, transparent 70%)',
          animation: 'float 10s ease-in-out infinite reverse',
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: phase >= 1 ? 1 : 0 }}
        transition={{ duration: 2, delay: 0.5 }}
      />

      {/* Exit fade to loop back smoothly */}
      <motion.div
        className="absolute inset-0"
        style={{ background: '#0D0905', pointerEvents: 'none' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: phase >= 5 ? 1 : 0 }}
        transition={{ duration: 1.5, ease: 'easeIn' }}
      />
    </motion.div>
  );
}
