'use client';

import { useEffect, useState } from 'react';

/** Sticky glass pill table of contents with scroll-spy and gold numbering. */
export function LegalToc({ items }: { items: { id: string; num: string; label: string }[] }) {
  const [active, setActive] = useState(items[0]?.id);

  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: '-20% 0px -70% 0px' }
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [items]);

  useEffect(() => {
    const el = document.querySelector<HTMLElement>(`.ld-toc a[aria-current='location']`);
    const bar = el?.parentElement?.parentElement;
    if (el && bar && bar.scrollWidth > bar.clientWidth) {
      bar.scrollTo({ left: el.offsetLeft - bar.clientWidth / 2 + el.clientWidth / 2, behavior: 'smooth' });
    }
  }, [active]);

  return (
    <nav className="ld-toc ld-glass" aria-label="תוכן העניינים">
      <ol>
        {items.map((i) => (
          <li key={i.id}>
            <a href={`#${i.id}`} aria-current={active === i.id ? 'location' : undefined}>
              <span className="ld-toc-n" aria-hidden>{i.num}.</span>
              {i.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
