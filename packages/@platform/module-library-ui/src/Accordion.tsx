'use client';
import { useId, useState } from 'react';

/** Accessible disclosure: real <button aria-expanded>, closed by default, chevron flips for RTL, smooth open (off with reduced motion via CSS). */
export function Accordion({ title, hint, children, defaultOpen = false, level = 3, className = '' }: { title: React.ReactNode; hint?: string; children: React.ReactNode; defaultOpen?: boolean; level?: 2 | 3; className?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const H = level === 2 ? 'h2' : 'h3';
  return (
    <div className={`fd-acc${open ? ' is-open' : ''} ${className}`.trim()}>
      <H className="fd-acc-h">
        <button type="button" className="fd-acc-btn" aria-expanded={open} aria-controls={`${id}-p`} id={`${id}-b`} onClick={() => setOpen((v) => !v)}>
          <span className="fd-acc-t">{title}</span>{hint ? <span className="fd-acc-hint">{hint}</span> : null}
          <span className="fd-acc-chev" aria-hidden>‹</span>
        </button>
      </H>
      <div className="fd-acc-p" id={`${id}-p`} role="region" aria-labelledby={`${id}-b`} hidden={!open}><div className="fd-acc-in">{children}</div></div>
    </div>
  );
}
