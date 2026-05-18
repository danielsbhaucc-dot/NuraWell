'use client';

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { useAlmogAvatarUrl } from '../../lib/client/useAlmogAvatarUrl';
import { ALMOG_AVATAR_FALLBACK } from '../../lib/ai/almog-avatar';
import { getTimeGreeting } from '../../lib/time/greeting';

interface DolevHeroHeaderProps {
  firstName: string;
  bubbleContent: ReactNode;
}

export function DolevHeroHeader({ firstName, bubbleContent }: DolevHeroHeaderProps) {
  const { avatarUrl } = useAlmogAvatarUrl();
  const heroGreeting = getTimeGreeting(new Date());

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="mb-3.5 rounded-2xl px-4 py-2.5"
        style={{
          background: 'rgba(255,255,255,0.16)',
          border: '1px solid rgba(255,255,255,0.28)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}
      >
        <div
          style={{ fontSize: '19px', color: '#fff', fontWeight: 900, fontFamily: "'Rubik','Heebo',sans-serif", lineHeight: 1.15 }}
        >
          {heroGreeting} {firstName}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="flex items-end gap-3.5"
      >
        <button
          type="button"
          className="relative flex-shrink-0"
          onClick={() => window.dispatchEvent(new Event('open-almog-chat'))}
          aria-label="פתח צ׳אט עם אלמוג"
        >
          <motion.div
            className="absolute rounded-full"
            style={{
              inset: '-8px',
              background: 'conic-gradient(from 0deg, #14b8a6, #10b981, #f59e0b, #10b981, #14b8a6)',
              filter: 'blur(14px)',
              opacity: 0.55,
              zIndex: -1,
            }}
          />
          <div
            style={{
              width: '82px',
              height: '82px',
              borderRadius: '50%',
              background: 'conic-gradient(from 0deg, #14b8a6 0%, #10b981 30%, #f59e0b 55%, #10b981 75%, #14b8a6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(16,185,129,0.2)',
            }}
          >
            <div
              style={{
                width: '74px',
                height: '74px',
                borderRadius: '50%',
                background: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '3px',
                overflow: 'hidden',
              }}
            >
              <img
                src={avatarUrl}
                alt="אלמוג"
                style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = ALMOG_AVATAR_FALLBACK;
                }}
              />
            </div>
          </div>
          <div
            style={{
              position: 'absolute',
              bottom: '0px',
              left: '-2px',
              background: '#14b8a6',
              border: '2px solid white',
              borderRadius: '20px',
              padding: '3px 7px',
              display: 'flex',
              gap: '2px',
              alignItems: 'center',
              boxShadow: '0 2px 8px rgba(20,184,166,0.4)',
            }}
          >
            <span style={{ width: '3px', height: '3px', background: 'white', borderRadius: '50%', display: 'inline-block' }} />
            <span style={{ width: '3px', height: '3px', background: 'white', borderRadius: '50%', display: 'inline-block' }} />
            <span style={{ width: '3px', height: '3px', background: 'white', borderRadius: '50%', display: 'inline-block' }} />
          </div>
        </button>

        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
          style={{
            flex: 1,
            background: 'rgba(255,255,255,0.14)',
            backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)',
            border: '1px solid rgba(255,255,255,0.28)',
            borderRadius: '18px 18px 18px 6px',
            padding: '11px 14px',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), 0 4px 20px rgba(0,0,0,0.15)',
          }}
        >
          <div
            style={{
              fontSize: '10px',
              color: '#A7F3D0',
              fontWeight: 700,
              letterSpacing: '0.5px',
              marginBottom: '4px',
            }}
          >
            ✦ ד״ר לב — המנטור שלך
          </div>
          <div
            style={{
              fontSize: '14px',
              color: 'rgba(255,255,255,0.92)',
              lineHeight: 1.55,
              fontWeight: 400,
              fontFamily: "'Heebo',sans-serif",
            }}
          >
            {bubbleContent}
          </div>
        </motion.div>
      </motion.div>
    </>
  );
}
