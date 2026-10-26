'use client';
// Ops hub: every product in the sidebar plus Overview / Module library / Costs / Security / Legal / Licenses.
// Product view = Finder-style module grid with real per-product toggles (server: IAM + step-up + audit).
import { useMemo, useState } from 'react';
import type { HubSection, ProductRow, ProductSummary, RegistryModule } from './types';
import { CAT_LABEL, TIER_LABEL, fmtNum, fmtUsd , CAT_TINT } from './labels';
import { ModuleIcon } from './ModuleIcon';
import { postJson } from './api';
import { ShareDialog, SellDialog, type PackOut } from './Dialogs';
import { LicensesView } from './LicensesView';
import type { ActivityItem, CostTrend } from './OverviewExtras';
import { Overview, CostsView, SecurityView, LegalView, ProductCard, type Deployment } from './HubViews';

export const API = { toggle: '/api/v1/ops/iam/modules', pack: '/api/v1/ops/modules/package', licensing: '/api/v1/ops/licensing' };
type Sel = HubSection | `product:${string}`;
type DialogInit = { s: 'done'; out: PackOut } | { s: 'error'; msg: string };

export interface FinderDashboardProps {
  registry: RegistryModule[]; products: ProductRow[]; summaries: ProductSummary[]; deployment: Deployment; metricsError: string | null; signingReady: boolean; activity?: ActivityItem[] | null; costTrend?: CostTrend;
  initialSection?: Sel; initialView?: 'icons' | 'list'; initialSelected?: string | null;
  initialDialog?: { kind: 'share' | 'sell'; state?: DialogInit }; licensesInitial?: Parameters<typeof LicensesView>[0]['initial']; licensesRevoke?: string; licensesUnblock?: string;
  moduleHref?: (id: string) => string;
}

export function FinderDashboard(p: FinderDashboardProps) {
  const { registry } = p;
  const [products, setProducts] = useState(p.products);
  const [sec, setSec] = useState<Sel>(p.initialSection ?? 'overview');
  const [view, setView] = useState(p.initialView ?? 'icons');
  const [sel, setSel] = useState<string | null>(p.initialSelected ?? null);
  const [dialog, setDialog] = useState(p.initialDialog ?? null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const href = p.moduleHref ?? ((id) => `/ops/modules/${id}`);
  const product = sec.startsWith('product:') ? products.find((x) => `product:${x.id}` === sec) ?? null : null;
  const isOn = (m: RegistryModule, pr: ProductRow | null) => !m.toggleable || Boolean(pr && m.store.iamModule && pr.enabled.includes(m.store.iamModule)) || !pr;
  const list = useMemo(() => registry.filter((m) => !q || `${m.store.name} ${m.id} ${m.description}`.toLowerCase().includes(q.toLowerCase())), [q, registry]);
  const selected = registry.find((m) => m.id === sel) ?? null;

  const toggle = (m: RegistryModule) => {
    if (!product || !m.toggleable || !m.store.iamModule || busy) return;
    const iam = m.store.iamModule; const next = !product.enabled.includes(iam);
    setBusy(m.id); setToast(null);
    postJson(API.toggle, { productId: product.id, moduleId: iam, enabled: next }, `${next ? 'הפעלת' : 'כיבוי'} ${m.store.name}`, (r) => {
      setBusy(null);
      if (r.ok) { setProducts((ps) => ps.map((x) => (x.id !== product.id ? x : { ...x, enabled: next ? [...x.enabled, iam] : x.enabled.filter((e) => e !== iam) }))); setToast({ ok: true, msg: `${m.store.name} ${next ? 'הופעל' : 'כובה'} ב-${product.name}.` }); }
      else setToast({ ok: false, msg: r.error });
    });
  };
  const nav = (id: Sel, label: string, extra?: React.ReactNode) => (
    <button key={id} type="button" className={`fd-prod ${sec === id ? 'is-active' : ''}`} onClick={() => { setSec(id); setSel(null); }} aria-current={sec === id}>{extra}<span className="fd-prod-name">{label}</span></button>
  );
  const sum = (id: string) => p.summaries.find((s) => s.productId === id) ?? null;
  const showModules = sec === 'library' || !!product;

  return (
    <div className="fd-root" dir="rtl" style={{ ['--pa' as string]: product?.color ?? '#2f9e6b' }}>
      <div className="fd-window">
        <aside className="fd-sidebar" aria-label="ניווט">
          <div className="fd-lights" aria-hidden><span /><span /><span /></div>
          <nav className="fd-products">{nav('overview', 'סקירה')}</nav>
          <div className="fd-side-title">מוצרים</div>
          <nav className="fd-products">{products.map((x) => nav(`product:${x.id}`, x.name, <span className="fd-prod-dot" style={{ background: x.color }} />))}</nav>
          <div className="fd-side-title">כללי</div>
          <nav className="fd-products">{nav('library', `ספריית מודולים (${registry.length})`)}{nav('costs', 'עלויות')}{nav('security', 'אבטחה')}{nav('legal', 'משפטי')}{nav('licenses', 'רישיונות')}</nav>
        </aside>
        <main className="fd-main">
          {toast ? <div className={`fd-toast ${toast.ok ? 'is-ok' : 'is-err'}`} role={toast.ok ? 'status' : 'alert'}>{toast.msg}<button type="button" onClick={() => setToast(null)} aria-label="סגירה">×</button></div> : null}
          {sec === 'overview' ? <Overview products={products} summaries={p.summaries} deployment={p.deployment} metricsError={p.metricsError} registry={registry} onOpen={(id) => setSec(`product:${id}`)} onNav={(k) => { setSec(k); setSel(null); }} activity={p.activity ?? null} costTrend={p.costTrend ?? null} href={href} /> : null}
          {sec === 'costs' ? <CostsView products={products} summaries={p.summaries} metricsError={p.metricsError} /> : null}
          {sec === 'security' ? <SecurityView deployment={p.deployment} registry={registry} /> : null}
          {sec === 'legal' ? <LegalView deployment={p.deployment} /> : null}
          {sec === 'licenses' ? <LicensesView api={API.licensing} initial={p.licensesInitial} initialRevoke={p.licensesRevoke} initialUnblock={p.licensesUnblock} moduleName={(id) => registry.find((m) => m.id === id)?.store.name ?? id} /> : null}
          {showModules ? (
            <>
              <header className="fd-toolbar">
                <div className="fd-path"><span>ספריית מודולים</span>{product ? <><span className="fd-sep">›</span><b>{product.name}</b></> : null}</div>
                <div className="fd-tools">
                  <input className="fd-search" placeholder="חיפוש מודול" value={q} onChange={(e) => setQ(e.target.value)} aria-label="חיפוש מודול" />
                  <div className="fd-seg" role="group" aria-label="תצוגה">
                    <button type="button" className={view === 'icons' ? 'is-on' : ''} onClick={() => setView('icons')} aria-pressed={view === 'icons'} aria-label="תצוגת סמלים">▦</button>
                    <button type="button" className={view === 'list' ? 'is-on' : ''} onClick={() => setView('list')} aria-pressed={view === 'list'} aria-label="תצוגת רשימה">☰</button>
                  </div>
                </div>
              </header>
              {product ? <ProductCard product={product} summary={sum(product.id)} metricsError={p.metricsError} /> : null}
              <div className="fd-status">{product ? `${registry.filter((m) => isOn(m, product)).length} פעילים מתוך ${registry.length} ב-${product.name}` : `${registry.length} מודולים בספרייה`}</div>
              {list.length === 0 ? <div className="fd-empty">לא נמצאו מודולים.</div> : view === 'icons' ? (
                <div className="fd-grid">{list.map((m) => (
                  <button key={m.id} type="button" className={`fd-tile ${sel === m.id ? 'is-sel' : ''}`} style={{ ['--tint' as string]: CAT_TINT[m.category] }} onClick={() => setSel(m.id)}>
                    <ModuleIcon m={m} on={isOn(m, product)} /><span className="fd-tile-name">{m.store.name}</span><span className={`fd-tier fd-tier-${m.distribution}`}>{TIER_LABEL[m.distribution]}</span>
                  </button>))}</div>
              ) : (
                <div className="fd-list" role="table">
                  <div className="fd-row fd-head" role="row"><span>שם</span><span>קטגוריה</span><span>הפצה</span><span>גרסה</span><span>מצב</span></div>
                  {list.map((m) => (
                    <div key={m.id} role="row" className={`fd-row ${sel === m.id ? 'is-sel' : ''}`} onClick={() => setSel(m.id)}>
                      <span className="fd-row-name"><ModuleIcon m={m} on={isOn(m, product)} small />{m.store.name}</span><span><span className="fd-chip fd-chip-cat" style={{ ['--tint' as string]: CAT_TINT[m.category] }}>{CAT_LABEL[m.category]}</span></span>
                      <span><span className={`fd-tier fd-tier-${m.distribution}`}>{TIER_LABEL[m.distribution]}</span></span><span className="fd-mono">{m.version}</span>
                      <span onClick={(e) => e.stopPropagation()}><Switch m={m} on={isOn(m, product)} product={product} busy={busy === m.id} onToggle={() => toggle(m)} /></span>
                    </div>))}
                </div>
              )}
            </>
          ) : null}
        </main>
        {showModules && selected ? (
          <aside className="fd-detail" aria-label="פרטי מודול">
            <button type="button" className="fd-close" onClick={() => setSel(null)} aria-label="סגירה">×</button>
            <ModuleIcon m={selected} on={isOn(selected, product)} big />
            <h2>{selected.store.name}</h2>
            <div className="fd-badges"><span className={`fd-tier fd-tier-${selected.distribution}`}>{TIER_LABEL[selected.distribution]}</span><span className="fd-chip fd-chip-cat" style={{ ['--tint' as string]: CAT_TINT[selected.category] }}>{CAT_LABEL[selected.category]}</span></div>
            <p>{selected.store.summary}</p>
            {product ? <div className="fd-toggle-row"><span>{!selected.toggleable ? 'תמיד פועל (אבטחה ופרטיות)' : !selected.store.iamModule ? 'אין מתג במוצר עדיין' : `פעיל ב-${product.name}`}</span><Switch m={selected} on={isOn(selected, product)} product={product} busy={busy === selected.id} onToggle={() => toggle(selected)} /></div> : null}
            <dl>
              <dt>תלויות</dt><dd>{Object.keys(selected.requires.modules).join(', ') || 'אין'}</dd>
              <dt>בשימוש במוצרים</dt><dd>{products.filter((x) => selected.usedBy.includes(x.id)).map((x) => x.name).join(', ') || 'אף מוצר'}</dd>
            </dl>
            <div className="fd-detail-actions fd-act-list">
              <div className="fd-act"><button type="button" className="fd-btn" disabled={selected.distribution === 'internal'} onClick={() => setDialog({ kind: 'share' })}>שיתוף</button><small>{selected.distribution === 'internal' ? 'רכיב פנימי, לא יוצא מהמערכת.' : 'מוריד קובץ לשליחה, בלי רישיון.'}</small></div>
              <div className="fd-act"><button type="button" className="fd-btn" disabled={selected.distribution !== 'sellable'} onClick={() => setDialog({ kind: 'sell' })}>מכירה</button><small>{selected.distribution !== 'sellable' ? 'הרכיב לא מסומן למכירה.' : 'רישיון לקונה אחד, לתקופה שתבחרו.'}</small></div>
            </div>
            <a className="fd-more" href={href(selected.id)}>לפרטים המלאים ‹</a>
          </aside>
        ) : null}
      </div>
      {dialog && selected ? (dialog.kind === 'share'
        ? <ShareDialog m={selected} api={API.pack} onClose={() => setDialog(null)} initial={dialog.state} />
        : <SellDialog m={selected} api={API.pack} signingReady={p.signingReady} onClose={() => setDialog(null)} initial={dialog.state} />) : null}
    </div>
  );
}

function Switch({ m, on, product, busy, onToggle }: { m: RegistryModule; on: boolean; product: ProductRow | null; busy: boolean; onToggle: () => void }) {
  const locked = !product || !m.toggleable || !m.store.iamModule;
  return (
    <button type="button" role="switch" aria-checked={on} aria-busy={busy} aria-label={`${m.store.name}: ${on ? 'פעיל' : 'כבוי'}${!m.toggleable ? ' (תמיד פועל)' : !m.store.iamModule ? ' (אין מתג במוצר עדיין)' : ''}`} disabled={locked || busy} onClick={onToggle} className={`fd-switch ${on ? 'is-on' : ''} ${locked ? 'is-locked' : ''} ${busy ? 'is-busy' : ''}`}>
      <span />
    </button>
  );
}
