'use client';

import { useLayoutEffect } from 'react';

/**
 * Keeps legal-page anchors clear of the sticky header and TOC, and of the cookie banner.
 * --ld-sticky-top is the space those bars will occupy once stuck (css top + height),
 * not the in-flow bottom of a TOC that is still further down the page.
 * Direct load often misses the native hash scroll, so the hash is applied again after layout with window.scrollTo.
 */
export function LdAnchorScroll() {
  useLayoutEffect(() => {
    const root = document.documentElement;

    const reserveTop = (): number => {
      let bottom = 0;
      for (const el of document.querySelectorAll<HTMLElement>('.ld-top, .ld-toc')) {
        const cs = getComputedStyle(el);
        if (cs.position !== 'sticky' && cs.position !== 'fixed') continue;
        const r = el.getBoundingClientRect();
        if (r.height < 1) continue;
        const topSpec = Number.parseFloat(cs.top) || 0;
        if (cs.position === 'fixed') {
          if (r.bottom <= 0 || r.top >= window.innerHeight) continue;
          bottom = Math.max(bottom, r.bottom);
          continue;
        }
        // Mid-page anchors make these bars stick at their CSS top.
        bottom = Math.max(bottom, topSpec + r.height);
        const alreadyStuck = Math.abs(r.top - topSpec) <= 2;
        if (alreadyStuck && r.bottom > 0 && r.top < window.innerHeight) {
          bottom = Math.max(bottom, r.bottom);
        }
      }
      return bottom;
    };

    const bannerTop = (): number => {
      const banner = document.querySelector<HTMLElement>('.cn-banner');
      if (!banner) return window.innerHeight;
      const cs = getComputedStyle(banner);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) {
        return window.innerHeight;
      }
      const r = banner.getBoundingClientRect();
      if (r.height < 1) return window.innerHeight;
      return r.top;
    };

    const measure = () => {
      root.style.setProperty('--ld-sticky-top', `${Math.ceil(reserveTop())}px`);
    };

    const go = () => {
      measure();
      const id = decodeURIComponent(location.hash.replace(/^#/, ''));
      if (!id) return;
      const el = document.getElementById(id);
      if (!el) return;
      // The section has padding-top; align the heading itself so it sits in the gap.
      const heading = document.getElementById(`${id}-h`) ?? el.querySelector('h2') ?? el;
      const topClear = reserveTop();
      const hr = heading.getBoundingClientRect();
      const gap = bannerTop() - topClear;
      let align = topClear + 8;
      if (hr.height + 8 > gap) {
        align = topClear + Math.max(0, (gap - hr.height) / 2);
      }
      const y = Math.max(0, window.scrollY + hr.top - align);
      // html { scroll-behavior: smooth } would animate and leave the heading covered mid-flight.
      const html = document.documentElement;
      const prev = html.style.scrollBehavior;
      html.style.scrollBehavior = 'auto';
      html.scrollTop = y;
      window.scrollTo(0, y);
      html.style.scrollBehavior = prev;
    };

    const timers: number[] = [];
    let raf = 0;
    const scheduleGo = () => {
      for (const t of timers) window.clearTimeout(t);
      timers.length = 0;
      if (raf) cancelAnimationFrame(raf);
      go();
      raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(() => {
          go();
          raf = 0;
        });
      });
      // A later pass wins over a router that resets scroll after a hash click.
      for (const ms of [80, 200, 400]) timers.push(window.setTimeout(go, ms));
    };

    const onClick = (event: MouseEvent) => {
      const a = (event.target as HTMLElement | null)?.closest?.('a[href^="#"]');
      if (!a || !a.closest('.ld')) return;
      const href = a.getAttribute('href') ?? '';
      if (href.length < 2) return;
      event.preventDefault();
      if (location.hash !== href) history.pushState(null, '', href);
      scheduleGo();
    };

    const onResize = () => {
      measure();
      if (location.hash) go();
    };

    measure();
    scheduleGo();
    window.addEventListener('hashchange', scheduleGo);
    window.addEventListener('load', scheduleGo);
    window.addEventListener('resize', onResize);
    document.addEventListener('click', onClick, true);
    const ro = new ResizeObserver(onResize);
    for (const el of document.querySelectorAll('.ld-top, .ld-toc, .cn-banner')) ro.observe(el);
    return () => {
      for (const t of timers) window.clearTimeout(t);
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('hashchange', scheduleGo);
      window.removeEventListener('load', scheduleGo);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('click', onClick, true);
      ro.disconnect();
    };
  }, []);
  return null;
}
