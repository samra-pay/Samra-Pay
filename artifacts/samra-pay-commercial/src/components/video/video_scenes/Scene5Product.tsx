// Scene 5: Product Proof — Phone mockup with features orbiting
// Duration: 12000ms

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene5Product() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1400),
      setTimeout(() => setPhase(3), 2500),
      setTimeout(() => setPhase(4), 4000),
      setTimeout(() => setPhase(5), 6500),
      setTimeout(() => setPhase(6), 9000),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  // Features that orbit the phone
  const features = [
    { label: 'Instant Transfers', sub: 'USD → ETB in seconds', pos: { top: '15%', left: '6%' }, delay: 0 },
    { label: 'Zero Fees', sub: 'No hidden costs', pos: { top: '38%', left: '3%' }, delay: 0.15 },
    { label: 'Samra Card', sub: 'Debit & rewards', pos: { bottom: '28%', left: '6%' }, delay: 0.3 },
    { label: 'Family Wallet', sub: 'Send to anyone in ET', pos: { top: '15%', right: '6%' }, delay: 0.1 },
    { label: 'Live Rates', sub: 'Best ETB exchange', pos: { top: '42%', right: '3%' }, delay: 0.25 },
    { label: 'Gold Rewards', sub: 'Earn on every send', pos: { bottom: '28%', right: '6%' }, delay: 0.4 },
  ];

  return (
    <motion.div
      className="absolute inset-0 overflow-hidden"
      style={{ background: '#120D06' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Background: subtle Ethiopian pattern */}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: phase >= 1 ? 1 : 0 }}
        transition={{ duration: 1.5 }}
      >
        <img
          src={`${import.meta.env.BASE_URL}images/hero-bg.jpg`}
          alt=""
          className="w-full h-full object-cover"
          style={{ filter: 'brightness(0.12) saturate(0.5)' }}
        />
      </motion.div>

      {/* Deep radial gradient for depth */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 70% 70% at center, rgba(201,154,46,0.04) 0%, #120D06 70%)' }}
      />

      {/* Top label */}
      <motion.div
        className="absolute font-body uppercase"
        style={{ top: '7%', left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }}
        initial={{ opacity: 0, y: -15 }}
        animate={{ opacity: phase >= 1 ? 1 : 0, y: phase >= 1 ? 0 : -15 }}
        transition={{ duration: 0.7 }}
      >
        <span style={{ color: 'var(--gold)', fontSize: '0.7rem', letterSpacing: '0.3em', textTransform: 'uppercase' }}>
          The App
        </span>
      </motion.div>

      {/* Headline */}
      <motion.div
        className="absolute font-display"
        style={{ top: '12%', left: '50%', transform: 'translateX(-50%)', textAlign: 'center', whiteSpace: 'nowrap' }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: phase >= 1 ? 1 : 0, y: phase >= 1 ? 0 : 20 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      >
        <span style={{ color: 'var(--cream)', fontSize: 'clamp(1.8rem, 4vw, 3rem)', fontWeight: 500, fontStyle: 'italic' }}>
          One app. Both worlds.
        </span>
      </motion.div>

      {/* Phone mockup — center hero */}
      <motion.div
        className="absolute"
        style={{
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'clamp(160px, 18vw, 240px)',
        }}
        initial={{ y: 60, opacity: 0, scale: 0.85 }}
        animate={{ y: phase >= 2 ? 0 : 60, opacity: phase >= 2 ? 1 : 0, scale: phase >= 2 ? 1 : 0.85 }}
        transition={{ duration: 1.2, ease: [0.34, 1.3, 0.64, 1] }}
      >
        {/* Phone frame */}
        <div
          style={{
            width: '100%',
            paddingBottom: '210%',
            position: 'relative',
            borderRadius: 'clamp(20px, 3vw, 36px)',
            background: '#1E1610',
            border: '1.5px solid rgba(201, 154, 46, 0.4)',
            boxShadow: '0 0 80px rgba(201,154,46,0.15), 0 40px 80px rgba(0,0,0,0.6)',
            overflow: 'hidden',
          }}
        >
          {/* Phone screen content */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(160deg, #1E1610 0%, #2A1F0E 100%)',
              padding: '1.5rem 1rem 1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.6rem',
            }}
          >
            {/* Status bar mock */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
              <div style={{ width: 40, height: 8, borderRadius: 4, background: 'rgba(201,154,46,0.2)' }} />
              <div style={{ width: 16, height: 8, borderRadius: 4, background: 'rgba(201,154,46,0.15)' }} />
            </div>
            {/* Logo */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.4rem' }}>
              <img
                src={`${import.meta.env.BASE_URL}images/logo.png`}
                alt="Samra Pay"
                style={{ height: 18, objectFit: 'contain', filter: 'brightness(0) saturate(100%) invert(78%) sepia(35%) saturate(600%) hue-rotate(10deg)' }}
              />
            </div>
            {/* Balance card */}
            <div style={{ background: 'linear-gradient(135deg, rgba(201,154,46,0.25) 0%, rgba(201,154,46,0.1) 100%)', borderRadius: 12, padding: '0.8rem 0.75rem', border: '1px solid rgba(201,154,46,0.2)' }}>
              <div style={{ color: 'rgba(245,240,232,0.5)', fontSize: '0.45rem', textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '0.3rem', fontFamily: 'var(--font-body)' }}>Total Balance</div>
              <div style={{ color: 'var(--cream)', fontSize: '1.1rem', fontFamily: 'var(--font-display)', fontWeight: 600 }}>$4,250.00</div>
              <div style={{ color: 'rgba(201,154,46,0.7)', fontSize: '0.4rem', marginTop: '0.2rem', fontFamily: 'var(--font-body)' }}>≈ 233,750 ETB</div>
            </div>
            {/* Send button mock */}
            <div style={{ background: 'var(--gold)', borderRadius: 8, padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(18,13,6,0.6)' }} />
              <div style={{ color: '#120D06', fontSize: '0.5rem', fontFamily: 'var(--font-body)', fontWeight: 600 }}>Send to Ethiopia</div>
            </div>
            {/* Transactions list mock */}
            {[
              { to: 'Tigist A.', amount: '+2,200 ETB', time: 'Just now' },
              { to: 'Meles F.', amount: '+5,500 ETB', time: '2h ago' },
            ].map((tx) => (
              <div key={tx.to} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0', borderBottom: '1px solid rgba(201,154,46,0.08)' }}>
                <div>
                  <div style={{ color: 'var(--cream)', fontSize: '0.4rem', fontFamily: 'var(--font-body)', fontWeight: 500 }}>{tx.to}</div>
                  <div style={{ color: 'rgba(245,240,232,0.4)', fontSize: '0.35rem', fontFamily: 'var(--font-body)' }}>{tx.time}</div>
                </div>
                <div style={{ color: 'rgba(201,154,46,0.85)', fontSize: '0.4rem', fontFamily: 'var(--font-display)', fontWeight: 600 }}>{tx.amount}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Glow under phone */}
        <div
          style={{
            position: 'absolute',
            bottom: -20,
            left: '10%',
            right: '10%',
            height: 40,
            background: 'radial-gradient(ellipse, rgba(201,154,46,0.25) 0%, transparent 70%)',
            filter: 'blur(8px)',
          }}
        />
      </motion.div>

      {/* Feature callouts — orbit the phone */}
      {features.map(({ label, sub, pos, delay }, i) => (
        <motion.div
          key={label}
          className="absolute"
          style={{
            ...pos,
            maxWidth: 160,
            padding: '0.6rem 0.9rem',
            background: 'rgba(18, 13, 6, 0.85)',
            border: '1px solid rgba(201, 154, 46, 0.25)',
            borderRadius: 10,
            backdropFilter: 'blur(8px)',
          }}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: phase >= 3 ? 1 : 0, scale: phase >= 3 ? 1 : 0.8 }}
          transition={{ duration: 0.6, delay: phase >= 3 ? delay : 0, ease: [0.34, 1.3, 0.64, 1] }}
        >
          <div className="font-body" style={{ color: 'var(--gold)', fontSize: '0.65rem', fontWeight: 600, marginBottom: '0.15rem' }}>
            {label}
          </div>
          <div className="font-body" style={{ color: 'rgba(245,240,232,0.55)', fontSize: '0.6rem', lineHeight: 1.3 }}>
            {sub}
          </div>
          {/* Connector dot */}
          <div
            style={{
              position: 'absolute',
              width: 4,
              height: 4,
              borderRadius: '50%',
              background: 'var(--gold)',
              opacity: 0.6,
              [i < 3 ? 'right' : 'left']: -8,
              top: '50%',
              transform: 'translateY(-50%)',
            }}
          />
        </motion.div>
      ))}

      {/* Bottom tagline */}
      <motion.div
        className="absolute font-display"
        style={{ bottom: '7%', left: '50%', transform: 'translateX(-50%)', textAlign: 'center', whiteSpace: 'nowrap' }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: phase >= 5 ? 1 : 0, y: phase >= 5 ? 0 : 20 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      >
        <span style={{ color: 'rgba(245,240,232,0.6)', fontSize: 'clamp(0.9rem, 1.8vw, 1.3rem)', fontStyle: 'italic' }}>
          Built for the Ethiopian diaspora.
        </span>
      </motion.div>
    </motion.div>
  );
}
