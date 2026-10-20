'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  COOKIE_GROUPS,
  COOKIE_NOTICE_STORAGE_KEY,
  COOKIE_NOTICE_VERSION,
  COOKIE_WINK,
  OPEN_COOKIE_PANEL_EVENT,
} from '@/lib/legal/cookie-inventory';
import './cookie-notice.css';

const HIDDEN_PREFIXES = ['/ops', '/gideon', '/device-check', '/auth/'];

function readSeen(): boolean {
  try {
    return window.localStorage.getItem(COOKIE_NOTICE_STORAGE_KEY) === COOKIE_NOTICE_VERSION;
  } catch {
    return false;
  }
}

function writeSeen() {
  try {
    window.localStorage.setItem(COOKIE_NOTICE_STORAGE_KEY, COOKIE_NOTICE_VERSION);
  } catch {
    /* private mode: notice simply shows again next visit */
  }
}

export function CookieWink({ className = '' }: { className?: string }) {
  return (
    <p className={`cn-wink ${className}`}>
      <span aria-hidden="true">🦊</span> {COOKIE_WINK}
    </p>
  );
}

function Toggle({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={`cn-tg ${on ? '' : 'off'}`}
      role="switch"
      aria-checked={on}
      aria-disabled="true"
      aria-label={label}
    >
      {on ? (
        <svg className="cn-lk" viewBox="0 0 16 16" aria-hidden="true">
          <rect x="3" y="7" width="10" height="7" rx="2" fill="currentColor" />
          <path d="M5.5 7V5a2.5 2.5 0 015 0v2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      ) : null}
    </span>
  );
}

export function CookiePanelBody() {
  return (
    <div className="cn-cats">
      {COOKIE_GROUPS.map((g) => {
        const on = g.kind !== 'unused';
        const state = g.kind === 'essential' ? 'תמיד פעיל' : g.kind === 'device' ? 'רק במכשיר' : 'לא בשימוש';
        return (
          <details key={g.id} className={`cn-cat ${on ? '' : 'is-off'}`} open={g.id === 'auth'}>
            <summary>
              <span className="cn-stripe" aria-hidden="true" />
              <span className="cn-ct">
                <strong>
                  {g.title}
                  <em className="cn-tag">{state}</em>
                </strong>
                <small>{g.short}</small>
              </span>
              <Toggle on={on} label={`${g.title}: ${state}`} />
            </summary>
            {g.items.length ? (
              <ul className="cn-items">
                {g.items.map((it) => (
                  <li key={it.name}>
                    <b>{it.label}</b>
                    <span>{it.what}</span>
                    <small>
                      <code dir="ltr">{it.name}</code> · ⏳ {it.duration}
                    </small>
                  </li>
                ))}
              </ul>
            ) : null}
          </details>
        );
      })}
    </div>
  );
}

export function CookieNotice() {
  const pathname = usePathname() || '/';
  const [banner, setBanner] = useState(false);
  const [panel, setPanel] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const hidden = HIDDEN_PREFIXES.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (!hidden && !readSeen()) setBanner(true);
  }, [hidden]);

  // Lift floating buttons (accessibility FAB) above the banner while it is visible.
  useEffect(() => {
    const root = document.documentElement;
    const el = bannerRef.current;
    if (!banner || panel || !el) {
      delete root.dataset.cookieBanner;
      return;
    }
    const sync = () => root.style.setProperty('--cn-banner-h', `${Math.ceil(el.getBoundingClientRect().height)}px`);
    sync();
    root.dataset.cookieBanner = 'on';
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      ro.disconnect();
      delete root.dataset.cookieBanner;
    };
  }, [banner, panel]);

  const openPanel = useCallback(() => {
    lastFocus.current = document.activeElement as HTMLElement | null;
    setPanel(true);
  }, []);

  const closePanel = useCallback(() => {
    setPanel(false);
    lastFocus.current?.focus?.();
  }, []);

  const accept = useCallback(() => {
    writeSeen();
    setBanner(false);
    setPanel(false);
  }, []);

  useEffect(() => {
    const h = () => openPanel();
    window.addEventListener(OPEN_COOKIE_PANEL_EVENT, h);
    return () => window.removeEventListener(OPEN_COOKIE_PANEL_EVENT, h);
  }, [openPanel]);

  useEffect(() => {
    if (!panel) return;
    const el = panelRef.current;
    el?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closePanel();
        return;
      }
      if (e.key !== 'Tab' || !el) return;
      const f = Array.from(el.querySelectorAll<HTMLElement>('button,a[href],summary,[tabindex="0"]')).filter(
        (x) => x.offsetParent !== null
      );
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [panel, closePanel]);

  if (hidden && !panel) return null;

  return (
    <>
      {banner && !panel ? (
        <div ref={bannerRef} className="cn-root cn-banner" role="region" aria-label="הודעה על עוגיות" dir="rtl">
          <div className="cn-art" role="img" aria-label="צנצנת עוגיות נעולה במנעול על אדן חלון שטוף שמש" />
          <div className="cn-bwrap">
            <h2 className="cn-h">
              שומרים רק על <span className="cn-gold">מה שצריך</span>
            </h2>
            <p className="cn-p">
              רק עוגיות חיוניות, כדי שהחיבור לחשבון יישמר והחשבון יהיה מוגן. בלי מעקב, בלי פרסום.{' '}
              <Link href="/cookies">כל הפרטים על העוגיות</Link>
            </p>
            <CookieWink />
            <div className="cn-chips" aria-hidden="true">
              <span>✦ בלי מעקב</span>
              <span>✦ בלי פרסום</span>
              <span>✦ בלי מדידה</span>
            </div>
            <div className="cn-btns">
              <button type="button" className="cn-btn p" onClick={accept}>
                הבנתי, תודה
              </button>
              <button type="button" className="cn-btn g" onClick={openPanel} aria-haspopup="dialog">
                מה בדיוק נשמר?
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {panel ? (
        <div
          className="cn-root cn-ov"
          dir="rtl"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closePanel();
          }}
        >
          <div
            ref={panelRef}
            className="cn-pn"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cn-pt"
            aria-describedby="cn-pd"
            tabIndex={-1}
          >
            <div className="cn-ph">
              <div className="cn-art sm" aria-hidden="true" />
              <div className="cn-pht">
                <h2 id="cn-pt" className="cn-h">
                  העוגיות <span className="cn-gold">שלנו</span>
                </h2>
                <p id="cn-pd" className="cn-p">
                  כל מה שנשמר במכשיר שלך, למה ולכמה זמן. אין כאן מה לכבות, כי אין כאן שום דבר מיותר.
                </p>
              </div>
              <button type="button" className="cn-x" onClick={closePanel} aria-label="סגירה">
                ✕
              </button>
            </div>
            <div className="cn-pbody">
              <CookieWink />
              <CookiePanelBody />
            </div>
            <div className="cn-ft">
              <button type="button" className="cn-btn p" onClick={accept}>
                הבנתי, תודה
              </button>
              <Link href="/cookies" className="cn-more" onClick={() => setPanel(false)}>
                מדיניות העוגיות המלאה ←
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function OpenCookiePanelButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="cn-btn g cn-inline"
      onClick={() => window.dispatchEvent(new Event(OPEN_COOKIE_PANEL_EVENT))}
      aria-haspopup="dialog"
    >
      {children}
    </button>
  );
}
