'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';

interface GuideBackIconButtonProps {
  onClick?: () => void;
  href?: string;
  ariaLabel: string;
  variant?: 'light' | 'immersive';
  className?: string;
}

export function GuideBackIconButton({
  onClick,
  href,
  ariaLabel,
  variant = 'light',
  className,
}: GuideBackIconButtonProps) {
  const classes = cn(
    'guide-back-icon-btn',
    variant === 'immersive' && 'guide-back-icon-btn--immersive',
    className,
  );

  if (href) {
    return (
      <Link href={href} aria-label={ariaLabel} className={classes}>
        <ChevronRight className="h-5 w-5" aria-hidden />
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel} className={classes}>
      <ChevronRight className="h-5 w-5" aria-hidden />
    </button>
  );
}
