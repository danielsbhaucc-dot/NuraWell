import type { Transition, Variants } from 'framer-motion';

export function challengeTransition(reduced: boolean): Transition {
  return reduced ? { duration: 0 } : { duration: 0.35, ease: 'easeOut' };
}

export function challengeFadeUp(reduced: boolean, delay = 0) {
  if (reduced) {
    return {
      initial: false as const,
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0 },
    };
  }
  return {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.35, ease: 'easeOut', delay },
  };
}

export function challengeScaleIn(reduced: boolean): Variants {
  if (reduced) {
    return {
      hidden: { opacity: 1, scale: 1 },
      visible: { opacity: 1, scale: 1 },
    };
  }
  return {
    hidden: { opacity: 0, scale: 0.92 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.3 } },
  };
}

export function challengeCelebrationProps(reduced: boolean) {
  if (reduced) {
    return {
      initial: { opacity: 1 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0.15 },
    };
  }
  return {
    initial: { scale: 0.85, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
    exit: { scale: 0.9, opacity: 0 },
    transition: { type: 'spring' as const, stiffness: 260, damping: 22 },
  };
}
