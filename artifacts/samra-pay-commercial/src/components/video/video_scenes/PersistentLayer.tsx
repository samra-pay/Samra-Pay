// Persistent layer — lives OUTSIDE AnimatePresence
// Elements that evolve across scenes for visual continuity

import { motion } from 'framer-motion';

interface PersistentLayerProps {
  currentScene: number;
}

export function PersistentLayer({ currentScene }: PersistentLayerProps) {
  return (
    <>
      {/* Top-left Amharic / brand tag — persists, fades between scenes */}
      <motion.div
        className="absolute"
        style={{ top: '3.5%', left: '4%', zIndex: 50 }}
        animate={{ opacity: currentScene === 0 ? 0 : currentScene === 5 ? 0 : 0.9 }}
        transition={{ duration: 0.8 }}
      >
        <span
          className="font-body uppercase tracking-widest"
          style={{ color: 'rgba(201,154,46,0.6)', fontSize: '0.6rem', letterSpacing: '0.3em' }}
        >
          SAMRA PAY
        </span>
      </motion.div>

      {/* Bottom-right scene indicator dots */}
      <motion.div
        className="absolute"
        style={{ bottom: '3.5%', right: '4%', display: 'flex', gap: 6, alignItems: 'center', zIndex: 50 }}
        animate={{ opacity: currentScene === 5 ? 0 : 0.7 }}
        transition={{ duration: 0.6 }}
      >
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <motion.div
            key={i}
            style={{ borderRadius: '50%', background: 'var(--gold)' }}
            animate={{
              width: currentScene === i ? 16 : 4,
              height: 4,
              opacity: currentScene === i ? 1 : 0.3,
            }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          />
        ))}
      </motion.div>

      {/* Persistent gold corner accent — top right */}
      <motion.div
        className="absolute"
        style={{ top: 0, right: 0, zIndex: 50, pointerEvents: 'none' }}
        animate={{
          opacity: currentScene === 0 ? 0.6 : currentScene === 5 ? 1 : 0.3,
        }}
        transition={{ duration: 1.0 }}
      >
        <svg width={60} height={60} viewBox="0 0 60 60">
          <path d="M60 0 L60 60" stroke="none" />
          <path d="M20 0 L60 0 L60 20" stroke="rgba(201,154,46,0.5)" strokeWidth="1" fill="none" />
        </svg>
      </motion.div>

      {/* Persistent gold corner accent — bottom left */}
      <motion.div
        className="absolute"
        style={{ bottom: 0, left: 0, zIndex: 50, pointerEvents: 'none' }}
        animate={{
          opacity: currentScene === 0 ? 0.6 : currentScene === 5 ? 1 : 0.3,
        }}
        transition={{ duration: 1.0 }}
      >
        <svg width={60} height={60} viewBox="0 0 60 60">
          <path d="M0 60 L40 60 L40 40" stroke="rgba(201,154,46,0.5)" strokeWidth="1" fill="none" />
        </svg>
      </motion.div>

      {/* Center gold orb — transforms scale/opacity across scenes for continuity */}
      <motion.div
        className="absolute"
        style={{
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(201,154,46,0.12) 0%, transparent 70%)',
          pointerEvents: 'none',
          zIndex: 1,
        }}
        animate={{
          width: currentScene === 3 ? '40vw' : '20vw',
          height: currentScene === 3 ? '40vw' : '20vw',
          top: '50%',
          left: '50%',
          x: '-50%',
          y: '-50%',
          opacity: [0, 1, 2, 3, 4].includes(currentScene) ? 1 : 0,
        }}
        transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
      />
    </>
  );
}
