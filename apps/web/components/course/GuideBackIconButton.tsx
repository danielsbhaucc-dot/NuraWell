'use client';

import { PageBackButton } from '../shared/PageBackButton';

interface GuideBackIconButtonProps {
  onClick?: () => void;
  href?: string;
  ariaLabel: string;
  variant?: 'light' | 'immersive';
  className?: string;
}

/** עטיפה לכפתור החזרה האחיד באתר (PageBackButton). */
export function GuideBackIconButton({ onClick, href, ariaLabel, variant = 'light', className }: GuideBackIconButtonProps) {
  return (
    <PageBackButton
      href={href}
      onClick={onClick}
      ariaLabel={ariaLabel}
      label="חזרה"
      variant={variant === 'immersive' ? 'onDark' : 'onLight'}
      className={className}
    />
  );
}
