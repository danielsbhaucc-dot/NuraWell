'use client';

import { useEffect, useState } from 'react';

/** Sticky table of contents with scroll-spy. Collapses to <details> on mobile. */
export function LegalToc({ items }: { items: { id: string; label: string }[] }) {
  const [active, setActive] = useState(items[0]?.id);

  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: '-15% 0px -70% 0px' }
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [items]);

  const list = (
    <ol className="ld-toc-list">
      {items.map((i) => (
        <li key={i.id}>
          <a href={`#${i.id}`} aria-current={active === i.id ? 'location' : undefined}>{i.label}</a>
        </li>
      ))}
    </ol>
  );

  return (
    <nav className="ld-toc" aria-label="תוכן העניינים">
      <details className="ld-toc-mobile">
        <summary>תוכן העניינים</summary>
        {list}
      </details>
      <div className="ld-toc-desk">
        <p className="ld-toc-h">תוכן העניינים</p>
        {list}
      </div>
    </nav>
  );
}
