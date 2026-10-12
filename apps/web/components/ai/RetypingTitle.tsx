'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * כותרת שמתחלפת "חי": הישנה נמחקת אות-אות ואז החדשה מוקלדת.
 * בפעם הראשונה (mount) ותחת prefers-reduced-motion — מוצגת מיד.
 */
export function RetypingTitle({ text, className }: { text: string; className?: string }) {
  const [shown, setShown] = useState(text);
  const shownRef = useRef(text);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    if (text === shownRef.current) return;
    const reduce =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      shownRef.current = text;
      setShown(text);
      return;
    }
    const target = Array.from(text);
    let current = Array.from(shownRef.current);
    let phase: 'delete' | 'type' = current.length ? 'delete' : 'type';
    setTyping(true);
    const id = window.setInterval(() => {
      if (phase === 'delete') {
        current = current.slice(0, -1);
        if (current.length === 0) phase = 'type';
      } else {
        current = target.slice(0, current.length + 1);
        if (current.length >= target.length) {
          window.clearInterval(id);
          setTyping(false);
        }
      }
      shownRef.current = current.join('');
      setShown(shownRef.current);
    }, phase === 'delete' ? 28 : 45);
    return () => {
      window.clearInterval(id);
      shownRef.current = text;
      setTyping(false);
    };
  }, [text]);

  return (
    <span className={className} dir="rtl" aria-label={text} title={text}>
      <span aria-hidden>{shown || '\u200f'}</span>
      {typing ? (
        <span aria-hidden className="ms-0.5 inline-block w-[1px] animate-pulse self-stretch bg-current align-middle" style={{ height: '1em' }} />
      ) : null}
    </span>
  );
}
