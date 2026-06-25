import type { CSSProperties } from 'react';

/** פאנל SOS — זכוכית כהה בסגנון iOS */
export const SOS_PANEL_STYLE: CSSProperties = {
  maxHeight: '100%',
  background: 'linear-gradient(168deg, rgba(36,36,38,0.94) 0%, rgba(22,22,24,0.96) 100%)',
  backdropFilter: 'blur(40px) saturate(180%)',
  WebkitBackdropFilter: 'blur(40px) saturate(180%)',
  border: '1px solid rgba(255,255,255,0.12)',
  boxShadow: '0 28px 90px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08)',
};

export const SOS_HEADER_STYLE: CSSProperties = {
  background: 'linear-gradient(180deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.03) 100%)',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
};

export const SOS_BODY_STYLE: CSSProperties = {
  background: 'transparent',
  WebkitOverflowScrolling: 'touch',
};

/** כפתור SOS בדף הבית — לא ירוק: אפור-חם מרגיע */
export const SOS_HOME_BUTTON_STYLE: CSSProperties = {
  borderRadius: '22px',
  background:
    'linear-gradient(165deg, rgba(72,72,74,0.55) 0%, rgba(44,44,46,0.82) 55%, rgba(36,36,38,0.9) 100%)',
  border: '1px solid rgba(255,255,255,0.14)',
  boxShadow:
    'inset 0 1px 0 rgba(255,255,255,0.12), 0 14px 36px rgba(0,0,0,0.22)',
  backdropFilter: 'blur(24px) saturate(160%)',
  WebkitBackdropFilter: 'blur(24px) saturate(160%)',
};

export const SOS_HOME_ICON_STYLE: CSSProperties = {
  background: 'rgba(255,255,255,0.1)',
  border: '1px solid rgba(255,255,255,0.12)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14)',
};

export const SOS_INSET_CLASS =
  'rounded-2xl border border-white/10 bg-white/[0.07] backdrop-blur-md';

export const SOS_MESSAGE_CARD_STYLE: CSSProperties = {
  background: 'linear-gradient(145deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.06) 100%)',
  border: '1px solid rgba(255,255,255,0.12)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 8px 24px rgba(0,0,0,0.2)',
};

export const SOS_PRIMARY_BTN_STYLE: CSSProperties = {
  background: 'linear-gradient(180deg, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0.12) 100%)',
  border: '1px solid rgba(255,255,255,0.22)',
  boxShadow: '0 6px 20px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.2)',
  color: '#f5f5f7',
};

export const SOS_SECONDARY_BTN_CLASS =
  'rounded-2xl border border-white/12 bg-white/[0.06] px-4 py-3 text-sm font-bold text-white/88 backdrop-blur-md';
