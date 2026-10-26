// Plugin-store page for one module. Every field comes from module.json / README / CHANGELOG / config schema (registry).
import type { ProductRow, RegistryModule } from './types';
import { CAT_LABEL, CAT_TINT, TIER_LABEL, TIER_MEANING } from './labels';
import { TechDetails } from './TechDetails';
import { ModuleIcon } from './ModuleIcon';
import { Accordion } from './Accordion';
import registryJson from './registry.generated.json';

const NAMES = new Map((registryJson as unknown as { modules: RegistryModule[] }).modules.flatMap((x) => [[x.id, x.store.name], [x.package, x.store.name]] as [string, string][]));
const REG_NAME = (k: string) => NAMES.get(k) ?? NAMES.get(k.replace(/^@platform\//, '')) ?? k;

const L = ({ items }: { items: string[] }) => (items.length ? <ul>{items.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="fd-dim">אין.</p>);
function Sec({ id, title, hint, children }: { id: string; title: string; hint?: string; children: React.ReactNode }) {
  return <section className="sp-sec sp-acc" id={id}><Accordion level={2} title={title} hint={hint}>{children}</Accordion></section>;
}

export function ModuleStorePage({ m, products, backHref = '/ops/modules' }: { m: RegistryModule; products: ProductRow[]; backHref?: string }) {
  const s = m.store;
  const used = products.filter((p) => m.usedBy.includes(p.id));
  const color = used[0]?.color ?? '#2f9e6b';
  const deps = Object.entries(m.requires.modules);
  const props = Object.entries(m.configSchema?.properties ?? {});
  return (
    <div className="fd-root sp-root" dir="rtl" style={{ ['--pa' as string]: color }}>
      <article className="sp-page">
        <a className="sp-back" href={backHref}>‹ חזרה לספריית המודולים</a>
        <header className="sp-hero">
          <ModuleIcon m={m} on big />
          <div>
            <h1>{s.name}</h1>
            <p className="sp-summary">{s.summary}</p>
            <div className="fd-badges"><span className={`fd-tier fd-tier-${m.distribution}`}>{TIER_LABEL[m.distribution]}</span><span className="fd-chip fd-chip-cat" style={{ ['--tint' as string]: CAT_TINT[m.category] }}>{CAT_LABEL[m.category]}</span>{!m.toggleable ? <span className="fd-chip">תמיד פועל</span> : null}</div>
          </div>
        </header>
        <section className="sp-sec" id="what" aria-labelledby="what-h"><h2 id="what-h">מה זה עושה</h2><p>{s.descriptionHe}</p></section>
        <Sec id="more" title="למי זה מתאים ומה הוא יודע" hint="קהל, שימושים ויכולות"><h3>למי זה מתאים</h3><L items={s.audience} /><h3>שימושים</h3><L items={s.useCases} /><h3>יכולות</h3><L items={s.features} /></Sec>
        <Sec id="preview" title="תצוגה מקדימה">
          <div className="sp-preview"><ModuleIcon m={m} on /><div><b>{s.name}</b><div className="fd-dim">{s.summary}</div></div></div>
        </Sec>
        <Sec id="reqs" title="דרישות ותלויות" hint="מודולים ומוצרים">
          <dl className="sp-dl">
            <dt>מודולים נדרשים</dt><dd>{deps.length ? deps.map(([k]) => <span key={k} className="fd-chip">{REG_NAME(k)}</span>) : 'אין'}</dd>
            <dt>מוצרים שמשתמשים בו</dt><dd>{used.length ? used.map((p) => <span key={p.id} className="fd-chip"><span className="fd-prod-dot" style={{ background: p.color }} />{p.name}</span>) : 'אף מוצר עדיין'}</dd>
          </dl>
        </Sec>
        <Sec id="security" title="הרשאות, מידע, אבטחה ופרטיות" hint="מה הוא רואה ואיפה זה נשמר">
          <h3>הרשאות</h3><L items={s.permissions} /><h3>מידע שהמודול נוגע בו</h3><L items={s.dataTouched} /><h3>אבטחה</h3><L items={s.security} />
          <p className="sp-callout"><b>איפה המידע נשמר:</b> {s.whereDataLives} המודול רץ על השרתים של מי שמתקין אותו.</p>
        </Sec>
        <Sec id="install" title="התקנה" hint="פקודה אחת, פעם אחת">
          <p>ההתקנה נעשית פעם אחת, בפקודה אחת, על ידי מי שמנהל את השרת. אחר כך מפעילים ומכבים מכאן, בלחיצה.</p>
          <TechDetails title="פרטים טכניים להתקנה">
            <pre className="sp-code" dir="ltr">node scripts/modules/install.mjs {m.id} --target &lt;repo&gt;</pre>
            <p>{s.installConfig}</p>
            <dl className="sp-dl"><dt>מזהה וגרסה</dt><dd className="fd-mono">{m.id}@{m.version}</dd><dt>תאימות</dt><dd>{s.compatibility}</dd><dt>משתני סביבה</dt><dd>{m.env.length ? m.env.map((e) => <span key={e} className="fd-chip fd-mono">{e}</span>) : 'אין'}</dd><dt>מיגרציות</dt><dd>{m.migrations.length ? m.migrations.join(', ') : 'אין'}</dd></dl>
          </TechDetails>
        </Sec>
        <Sec id="settings" title="הגדרות">
          {props.length ? <><L items={props.map(([, p]) => p.description_he ?? '')} /><TechDetails title="פרטים טכניים להגדרות">
            <table className="sp-table"><thead><tr><th>שדה</th><th>סוג</th><th>ברירת מחדל</th><th>מה זה</th></tr></thead>
              <tbody>{props.map(([k, p]) => <tr key={k}><td className="fd-mono">{k}</td><td className="fd-mono">{p.type ?? '–'}</td><td className="fd-mono">{p.const !== undefined ? `${String(p.const)} (קבוע)` : p.default !== undefined ? JSON.stringify(p.default) : '–'}</td><td>{p.description_he ?? ''}</td></tr>)}</tbody></table>
          </TechDetails></> : <p>אין מה להגדיר. ברירות המחדל בטוחות.</p>}
        </Sec>
        <Sec id="version" title="גרסה ושינויים" hint={`גרסה ${m.version}`}>
          <p><b>גרסה {m.version}</b></p>
          <TechDetails title="רשימת השינויים"><pre className="sp-changelog">{m.changelog.replace(/^# .*\n+/, '')}</pre></TechDetails>
        </Sec>
        {m.id === 'licensing' ? <Sec id="blocking" title="איך חוסמים ומשחררים">
          <L items={[
            'לוחצים "חסימה", "ביטול חסימה" או "מפתח חדש" במסך הרישיונות. כל פעולה היא כפתור אחד.',
            'במנוי חודשי הקונה מקבל חבילה נעולה (קוד מוצפן). בלי רישיון תקף אין מפתח לפתוח אותה, והרכיב לא נטען.',
            'הרישיון תקף עד החיוב הבא ועוד 3 ימי חסד. אחרי תשלום מנפיקים רישיון חדש (בערך בקשה אחת ללקוח בחודש).',
            'חסימה או שחרור באמצע: מעדכנים קובץ סטטוס חתום שהקונה קורא כל כשתי דקות. הקבצים אצלו לא נמחקים.',
            'אם קובץ הסטטוס לא נגיש יותר מ-6 שעות, הרכיב נעצר עד שהבדיקה חוזרת (אי אפשר "לנתק" ולהמשיך להשתמש).',
            'שינוי קבצי החבילה מזוהה והרכיב מסרב לרוץ. בכל עותק יש סימן נסתר שמזהה את הקונה.',
            'נתיב "מוח מרחוק" (חסימה בשניות, קוד רגיש אצלנו) הוא אופציה יקרה בנפרד, לא ברירת המחדל של מנוי.',
          ]} />
        </Sec> : null}
        <Sec id="tier" title="רמת הפצה"><p><b>{TIER_LABEL[m.distribution]}:</b> {TIER_MEANING[m.distribution]}</p></Sec>
        <Sec id="support" title="תמיכה ומגבלות"><p>{s.support}</p><h3>מגבלות ידועות</h3><L items={s.limitations} /></Sec>
      </article>
    </div>
  );
}
