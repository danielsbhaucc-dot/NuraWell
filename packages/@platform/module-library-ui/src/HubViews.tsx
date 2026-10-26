// Read-only hub panels. Every number is an aggregate from the server; null = unavailable (shown as such, never guessed).
import type { ProductRow, ProductSummary, RegistryModule } from './types';
import { fmtNum, fmtUsd } from './labels';

export type Deployment = { securityOpen: number | null; tasksOpen: number | null };
const NA = 'אין נתון';
const Stat = ({ label, value, hint }: { label: string; value: string | null; hint?: string }) => (
  <div className={`hb-stat ${value === null ? 'is-na' : ''}`}><span className="hb-stat-v">{value ?? NA}</span><span className="hb-stat-l">{label}</span>{hint ? <span className="hb-stat-h">{hint}</span> : null}</div>
);

export function ProductCard({ product, summary, metricsError }: { product: ProductRow; summary: ProductSummary | null; metricsError: string | null }) {
  const none = !summary;
  return (
    <section className="hb-card" style={{ ['--pa' as string]: product.color }} aria-label={`סיכום ${product.name}`}>
      <header><span className="fd-prod-dot" style={{ background: product.color }} /><h3>{product.name}</h3>
        {product.panelHref ? <a className="fd-btn fd-btn-primary" href={product.panelHref}>פתיחת לוח הבקרה</a> : <button type="button" className="fd-btn" disabled title="עוד לא נבנה">לוח בקרה: עוד לא נבנה</button>}
      </header>
      {none ? <p className="fd-empty">{metricsError ? 'הנתונים לא זמינים כרגע.' : 'עוד אין נתונים למוצר הזה.'}</p> : (
        <div className="hb-stats">
          <Stat label="משתמשים" value={fmtNum(summary.users)} />
          <Stat label="עלות AI" value={fmtUsd(summary.aiCost30dUsd)} hint="30 הימים האחרונים" />
          <Stat label="שגיאות" value={fmtNum(summary.errors7d)} hint="7 ימים" />
          <Stat label="התראות אבטחה פתוחות" value={fmtNum(summary.securityOpen)} hint={summary.securityOpen === null ? 'לא נמדד לפי מוצר' : undefined} />
          <Stat label="משימות פתוחות" value={fmtNum(summary.tasksOpen)} hint={summary.tasksOpen === null ? 'לא נמדד לפי מוצר' : undefined} />
        </div>
      )}
    </section>
  );
}

export function Overview({ products, summaries, deployment, metricsError, registry, onOpen }: { products: ProductRow[]; summaries: ProductSummary[]; deployment: Deployment; metricsError: string | null; registry: RegistryModule[]; onOpen: (id: string) => void }) {
  return (
    <div className="fd-pane">
      <h2>סקירה</h2>
      {metricsError ? <p className="fd-warn" role="alert">נתוני המוצרים לא זמינים כרגע. מה שמוצג כאן הוא רק מה שנטען.</p> : null}
      <div className="hb-stats hb-top">
        <Stat label="מוצרים" value={fmtNum(products.length)} />
        <Stat label="מודולים בספרייה" value={fmtNum(registry.length)} />
        <Stat label="אירועי אבטחה פתוחים" value={fmtNum(deployment.securityOpen)} hint="בכל המערכת" />
        <Stat label="משימות ציות פתוחות" value={fmtNum(deployment.tasksOpen)} hint="בכל המערכת" />
      </div>
      <div className="hb-cards">
        {products.map((p) => (
          <div key={p.id} className="hb-wrap">
            <ProductCard product={p} summary={summaries.find((s) => s.productId === p.id) ?? null} metricsError={metricsError} />
            <button type="button" className="fd-link" onClick={() => onOpen(p.id)}>המודולים של {p.name} ‹</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CostsView({ products, summaries, metricsError }: { products: ProductRow[]; summaries: ProductSummary[]; metricsError: string | null }) {
  const rows = products.map((p) => ({ p, s: summaries.find((x) => x.productId === p.id) ?? null }));
  const known = rows.filter((r) => r.s?.aiCost30dUsd != null);
  return (
    <div className="fd-pane">
      <h2>עלויות</h2>
      <p className="fd-dim">עלות AI ב-30 הימים האחרונים, לפי מוצר. פירוט מלא בעמוד העלויות.</p>
      {metricsError ? <p className="fd-warn" role="alert">נתוני העלויות לא זמינים כרגע.</p> : null}
      <div className="fd-list" role="table">
        <div className="fd-row fd-head fd-row-2" role="row"><span>מוצר</span><span>עלות AI</span></div>
        {rows.map(({ p, s }) => <div key={p.id} className="fd-row fd-row-2" role="row"><span className="fd-row-name"><span className="fd-prod-dot" style={{ background: p.color }} />{p.name}</span><span className="fd-mono">{fmtUsd(s?.aiCost30dUsd ?? null) ?? NA}</span></div>)}
        {known.length ? <div className="fd-row fd-row-2 fd-total" role="row"><span>סה״כ ידוע</span><span className="fd-mono">{fmtUsd(known.reduce((a, r) => a + (r.s!.aiCost30dUsd ?? 0), 0))}</span></div> : null}
      </div>
      <a className="fd-more" href="/ops/costs">לעמוד העלויות ‹</a>
    </div>
  );
}

export function SecurityView({ deployment, registry }: { deployment: Deployment; registry: RegistryModule[] }) {
  const sec = registry.filter((m) => m.category === 'security' || m.category === 'privacy');
  return (
    <div className="fd-pane">
      <h2>אבטחה</h2>
      <div className="hb-stats hb-top"><Stat label="אירועי אבטחה פתוחים" value={fmtNum(deployment.securityOpen)} hint="בכל המערכת" /><Stat label="מודולי אבטחה ופרטיות" value={fmtNum(sec.length)} /></div>
      <ul className="hb-ul">{sec.map((m) => <li key={m.id}><b>{m.store.name}</b> · {m.toggleable ? 'ניתן לכיבוי' : 'תמיד פועל'}</li>)}</ul>
      <a className="fd-more" href="/ops">ליומן האירועים ‹</a>
    </div>
  );
}

export function LegalView({ deployment }: { deployment: Deployment }) {
  return (
    <div className="fd-pane">
      <h2>משפטי</h2>
      <div className="hb-stats hb-top"><Stat label="משימות ציות פתוחות" value={fmtNum(deployment.tasksOpen)} hint="בכל המערכת" /></div>
      <p className="fd-warn">תנאי הרישיון למכירת מודולים הם <b>טיוטה לבדיקה משפטית</b> ועוד לא אושרו.</p>
      <a className="fd-more" href="/ops/legal">לעמוד המשפטי ‹</a>
    </div>
  );
}
