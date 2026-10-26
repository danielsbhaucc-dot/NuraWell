'use client';
// Mac Finder-style module library: products in the sidebar, modules in the main pane (icon/list views),
// per-product enable/disable, distribution-tier badges and a detail panel. Mock: state is local only.
import { useMemo, useState } from 'react';
import { MODULES, PRODUCTS, type LibModule, type Product, type Tier } from './mock-data';

const TIER_LABEL: Record<Tier, string> = { internal: 'פנימי', shareable: 'לשיתוף', sellable: 'למכירה' };
const CAT_LABEL = { security: 'אבטחה', privacy: 'פרטיות', platform: 'פלטפורמה', feature: 'פיצ׳ר', ui: 'ממשק', ops: 'תפעול' } as const;
const CAT_TINT = { security: '#5b6472', privacy: '#6b5f86', platform: '#4f6f8f', feature: '#3f7d68', ui: '#7a6a52', ops: '#6a6f76' } as const;

export interface FinderDashboardProps { initialProduct?: string; initialView?: 'icons' | 'list'; initialSelected?: string | null }

export function FinderDashboard({ initialProduct = 'nurawell', initialView = 'icons', initialSelected = null }: FinderDashboardProps) {
  const [products, setProducts] = useState<Product[]>(PRODUCTS);
  const [pid, setPid] = useState(initialProduct);
  const [view, setView] = useState(initialView);
  const [sel, setSel] = useState<string | null>(initialSelected);
  const [q, setQ] = useState('');
  const product = products.find((p) => p.id === pid) ?? products[0];
  const isOn = (m: LibModule) => m.alwaysOn || product.enabled.includes(m.id);
  const list = useMemo(() => MODULES.filter((m) => !q || (m.name + m.id).toLowerCase().includes(q.toLowerCase())), [q]);
  const selected = MODULES.find((m) => m.id === sel) ?? null;
  const toggle = (m: LibModule) => {
    if (m.alwaysOn) return;
    setProducts((ps) => ps.map((p) => (p.id !== pid ? p : { ...p, enabled: p.enabled.includes(m.id) ? p.enabled.filter((x) => x !== m.id) : [...p.enabled, m.id] })));
  };
  const onCount = MODULES.filter(isOn).length;

  return (
    <div className="fd-root" dir="rtl">
      <div className="fd-window">
        <aside className="fd-sidebar" aria-label="מוצרים">
          <div className="fd-lights" aria-hidden><span /><span /><span /></div>
          <div className="fd-side-title">מוצרים</div>
          <nav className="fd-products">
            {products.map((p) => (
              <button key={p.id} type="button" className={`fd-prod ${p.id === pid ? 'is-active' : ''}`} onClick={() => setPid(p.id)} aria-current={p.id === pid}>
                <span className="fd-prod-dot" style={{ background: p.color }} />
                <span className="fd-prod-name">{p.name}</span>
                <span className="fd-prod-count">{MODULES.filter((m) => m.alwaysOn || p.enabled.includes(m.id)).length}</span>
              </button>
            ))}
          </nav>
          <div className="fd-side-title">ספרייה</div>
          <div className="fd-side-static">כל המודולים <b>{MODULES.length}</b></div>
          <div className="fd-side-static">ממוצרים אחרים <b>{MODULES.filter((m) => m.origin !== 'NuraWell').length}</b></div>
        </aside>

        <main className="fd-main">
          <header className="fd-toolbar">
            <div className="fd-path"><span>ספריית מודולים</span><span className="fd-sep">›</span><b>{product.name}</b></div>
            <div className="fd-tools">
              <input className="fd-search" placeholder="חיפוש מודול" value={q} onChange={(e) => setQ(e.target.value)} aria-label="חיפוש מודול" />
              <div className="fd-seg" role="group" aria-label="תצוגה">
                <button type="button" className={view === 'icons' ? 'is-on' : ''} onClick={() => setView('icons')} aria-pressed={view === 'icons'} aria-label="תצוגת סמלים">▦</button>
                <button type="button" className={view === 'list' ? 'is-on' : ''} onClick={() => setView('list')} aria-pressed={view === 'list'} aria-label="תצוגת רשימה">☰</button>
              </div>
            </div>
          </header>
          <div className="fd-status">{onCount} פעילים מתוך {MODULES.length} ב-{product.name}</div>

          {view === 'icons' ? (
            <div className="fd-grid">
              {list.map((m) => (
                <button key={m.id} type="button" className={`fd-tile ${sel === m.id ? 'is-sel' : ''}`} onClick={() => setSel(m.id)}>
                  <ModuleIcon m={m} on={isOn(m)} />
                  <span className="fd-tile-name">{m.name}</span>
                  <span className={`fd-tier fd-tier-${m.tier}`}>{TIER_LABEL[m.tier]}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="fd-list" role="table">
              <div className="fd-row fd-head" role="row"><span>שם</span><span>קטגוריה</span><span>הפצה</span><span>גרסה</span><span>מצב</span></div>
              {list.map((m) => (
                <div key={m.id} role="row" className={`fd-row ${sel === m.id ? 'is-sel' : ''}`} onClick={() => setSel(m.id)}>
                  <span className="fd-row-name"><ModuleIcon m={m} on={isOn(m)} small />{m.name}</span>
                  <span>{CAT_LABEL[m.category]}</span>
                  <span><span className={`fd-tier fd-tier-${m.tier}`}>{TIER_LABEL[m.tier]}</span></span>
                  <span className="fd-mono">{m.version}</span>
                  <span onClick={(e) => e.stopPropagation()}><Switch m={m} on={isOn(m)} onToggle={() => toggle(m)} /></span>
                </div>
              ))}
            </div>
          )}
        </main>

        {selected ? (
          <aside className="fd-detail" aria-label="פרטי מודול">
            <button type="button" className="fd-close" onClick={() => setSel(null)} aria-label="סגירה">×</button>
            <ModuleIcon m={selected} on={isOn(selected)} big />
            <h2>{selected.name}</h2>
            <div className="fd-mono fd-dim">{selected.id}@{selected.version}</div>
            <div className="fd-badges"><span className={`fd-tier fd-tier-${selected.tier}`}>{TIER_LABEL[selected.tier]}</span><span className="fd-chip">{CAT_LABEL[selected.category]}</span><span className="fd-chip">מקור: {selected.origin}</span></div>
            <p>{selected.description}</p>
            <div className="fd-toggle-row">
              <span>{selected.alwaysOn ? 'תמיד פועל (אבטחה/פרטיות)' : `פעיל ב-${product.name}`}</span>
              <Switch m={selected} on={isOn(selected)} onToggle={() => toggle(selected)} />
            </div>
            <dl>
              <dt>תלויות</dt><dd>{selected.deps.length ? selected.deps.join(', ') : 'אין'}</dd>
              <dt>פעיל במוצרים</dt><dd>{products.filter((p) => selected.alwaysOn || p.enabled.includes(selected.id)).map((p) => p.name).join(', ') || 'אף מוצר'}</dd>
            </dl>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function Switch({ m, on, onToggle }: { m: LibModule; on: boolean; onToggle: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={`${m.name}: ${on ? 'פעיל' : 'כבוי'}`} disabled={m.alwaysOn} onClick={onToggle} className={`fd-switch ${on ? 'is-on' : ''} ${m.alwaysOn ? 'is-locked' : ''}`}>
      <span />
    </button>
  );
}

function ModuleIcon({ m, on, small, big }: { m: LibModule; on: boolean; small?: boolean; big?: boolean }) {
  return (
    <span className={`fd-icon ${small ? 'is-small' : ''} ${big ? 'is-big' : ''} ${on ? '' : 'is-off'}`} style={{ ['--tint' as string]: CAT_TINT[m.category] }} aria-hidden>
      <span className="fd-icon-tab" />
      <span className="fd-icon-body">{m.name.slice(0, 1)}</span>
      {on ? <span className="fd-icon-on" /> : null}
    </span>
  );
}
