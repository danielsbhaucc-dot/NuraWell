// Overview widgets. Everything shown comes from real sources; missing data is labelled, never estimated.
import type { ProductRow, RegistryModule } from './types';
import { CAT_LABEL, CAT_TINT, fmtUsd } from './labels';
import { ModuleIcon } from './ModuleIcon';

export type ActivityItem = { at: string; kind: string; productId: string | null };
export type CostDay = { day: string; usd: number };
export type CostTrend = { days: CostDay[]; partial: boolean } | null;

const KIND_HE: Record<string, string> = {
  grant: 'ניתנה הרשאה', revoke: 'בוטלה הרשאה', deny: 'בקשה נחסמה', elevate: 'הרשאה זמנית נפתחה', expire: 'הרשאה זמנית פגה', product: 'שינוי במוצר',
  grant_denied: 'מתן הרשאה נחסם', module_denied: 'גישה למודול נחסמה', module_shared: 'חבילת מודול שותפה', module_package_refused: 'שיתוף מודול נדחה',
  license_issued: 'הונפק רישיון', license_renewed: 'רישיון חודש', license_revoked: 'רישיון בוטל', license_reinstated: 'רישיון הוחזר לפעולה',
  revocation_list_published: 'פורסמה רשימת חסימות', module_enabled: 'מודול הופעל', module_disabled: 'מודול כובה',
};
const when = (iso: string) => new Date(iso).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });

export function ActivityList({ items, products }: { items: ActivityItem[] | null; products: ProductRow[] }) {
  return (
    <section className="hb-panel">
      <h3>פעילות אחרונה</h3>
      {items === null ? <p className="fd-dim">יומן הפעילות לא זמין כרגע.</p> : !items.length ? <p className="fd-dim">אין עדיין פעולות ביומן.</p> : (
        <ol className="hb-feed">
          {items.map((a, i) => { const p = products.find((x) => x.id === a.productId); return (
            <li key={i}><span className="fd-prod-dot" style={{ background: p?.color ?? '#8a94a0' }} /><span className="hb-feed-k">{KIND_HE[a.kind] ?? 'פעולת מערכת'}</span><span className="hb-feed-p">{p?.name ?? 'כללי'}</span><time className="hb-feed-t" dateTime={a.at}>{when(a.at)}</time></li>
          ); })}
        </ol>
      )}
      <p className="hb-foot">מתוך יומן הביקורת. בלי שמות ובלי פרטים אישיים.</p>
    </section>
  );
}

export function CostTrendChart({ trend }: { trend: CostTrend }) {
  if (!trend || !trend.days.length) return <section className="hb-panel"><h3>עלות AI ב-30 יום</h3><p className="fd-dim">{trend ? 'לא נרשמו עלויות ב-30 הימים האחרונים.' : 'נתוני העלות היומיים לא זמינים כרגע.'}</p></section>;
  const max = Math.max(...trend.days.map((d) => d.usd), 0.000001);
  const total = trend.days.reduce((a, d) => a + d.usd, 0);
  return (
    <section className="hb-panel">
      <h3>עלות AI ב-30 יום <span className="hb-total">{fmtUsd(total)}{trend.partial ? ' (חלקי)' : ''}</span></h3>
      <div className="hb-bars" role="img" aria-label={`עלות יומית, סה״כ ${fmtUsd(total)}`}>
        {trend.days.map((d) => <span key={d.day} className="hb-bar" style={{ height: `${Math.max(2, (d.usd / max) * 100)}%` }} title={`${d.day}: ${fmtUsd(d.usd)}`} />)}
      </div>
      <div className="hb-axis"><span>{trend.days[0].day}</span><span>{trend.days[trend.days.length - 1].day}</span></div>
    </section>
  );
}

export function QuickLinks({ onNav }: { onNav: (sec: 'library' | 'costs' | 'security' | 'legal' | 'licenses') => void }) {
  const L = [['library', 'ספריית מודולים', 'כל הרכיבים, הפעלה וכיבוי'], ['costs', 'עלויות', 'הוצאות AI לפי מוצר'], ['security', 'אבטחה', 'אירועים ובדיקות'], ['legal', 'משפטי', 'משימות ציות'], ['licenses', 'רישיונות', 'הנפקה וביטול']] as const;
  return <nav className="hb-quick" aria-label="קיצורים">{L.map(([k, t, d]) => <button key={k} type="button" className="hb-q" onClick={() => onNav(k)}><b>{t}</b><span>{d}</span></button>)}</nav>;
}

export function LibraryPreview({ registry, href }: { registry: RegistryModule[]; href: (id: string) => string }) {
  const cats = [...new Set(registry.map((m) => m.category))];
  return (
    <section className="hb-panel hb-lib">
      <h3>ספריית המודולים לפי קטגוריה</h3>
      <div className="hb-cats">
        {cats.map((c) => (
          <div key={c} className="hb-cat" style={{ ['--tint' as string]: CAT_TINT[c] }}>
            <div className="hb-cat-h">{CAT_LABEL[c]} <span>{registry.filter((m) => m.category === c).length}</span></div>
            {registry.filter((m) => m.category === c).map((m) => <a key={m.id} href={href(m.id)} className="hb-cat-m"><ModuleIcon m={m} on small /><span>{m.store.name}</span></a>)}
          </div>
        ))}
      </div>
    </section>
  );
}
