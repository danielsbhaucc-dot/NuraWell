// Plugin-store page for one module. Every field comes from module.json / README / CHANGELOG / config schema (registry).
import type { ProductRow, RegistryModule } from './types';
import { CAT_LABEL, TIER_LABEL, TIER_MEANING } from './labels';
import { ModuleIcon } from './ModuleIcon';

const L = ({ items }: { items: string[] }) => (items.length ? <ul>{items.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="fd-dim">אין.</p>);
function Sec({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return <section className="sp-sec" id={id} aria-labelledby={`${id}-h`}><h2 id={`${id}-h`}>{title}</h2>{children}</section>;
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
            <div className="fd-badges"><span className={`fd-tier fd-tier-${m.distribution}`}>{TIER_LABEL[m.distribution]}</span><span className="fd-chip">{CAT_LABEL[m.category]}</span><span className="fd-chip fd-mono">{m.id}@{m.version}</span>{!m.toggleable ? <span className="fd-chip">תמיד פועל</span> : null}</div>
          </div>
        </header>
        <nav className="sp-toc" aria-label="תוכן העמוד">{[['what', 'מה זה עושה'], ['install', 'התקנה'], ['settings', 'הגדרות'], ['security', 'אבטחה ופרטיות'], ['version', 'גרסה'], ['support', 'תמיכה ומגבלות']].map(([id, t]) => <a key={id} href={`#${id}`}>{t}</a>)}</nav>
        <Sec id="what" title="מה זה עושה"><p>{s.descriptionHe}</p><h3>למי זה מתאים</h3><L items={s.audience} /><h3>שימושים</h3><L items={s.useCases} /><h3>יכולות</h3><L items={s.features} /></Sec>
        <Sec id="preview" title="תצוגה מקדימה">
          <div className="sp-preview"><ModuleIcon m={m} on /><div><b>{s.name}</b><div className="fd-dim">{s.summary}</div></div></div>
        </Sec>
        <Sec id="reqs" title="דרישות ותלויות">
          <dl className="sp-dl">
            <dt>מודולים נדרשים</dt><dd>{deps.length ? deps.map(([k, v]) => <span key={k} className="fd-chip fd-mono">{k} {v}</span>) : 'אין'}</dd>
            <dt>משתני סביבה</dt><dd>{m.env.length ? m.env.map((e) => <span key={e} className="fd-chip fd-mono">{e}</span>) : 'אין'}</dd>
            <dt>מיגרציות</dt><dd>{m.migrations.length ? m.migrations.join(', ') : 'אין'}</dd>
            <dt>מוצרים שמשתמשים בו</dt><dd>{used.length ? used.map((p) => <span key={p.id} className="fd-chip"><span className="fd-prod-dot" style={{ background: p.color }} />{p.name}</span>) : 'אף מוצר עדיין'}</dd>
          </dl>
        </Sec>
        <Sec id="security" title="הרשאות, מידע, אבטחה ופרטיות">
          <h3>הרשאות</h3><L items={s.permissions} /><h3>מידע שהמודול נוגע בו</h3><L items={s.dataTouched} /><h3>אבטחה</h3><L items={s.security} />
          <p className="sp-callout"><b>איפה המידע נשמר:</b> {s.whereDataLives} המודול רץ על השרתים של מי שמתקין אותו.</p>
        </Sec>
        <Sec id="install" title="התקנה">
          <p>פקודה אחת:</p><pre className="sp-code" dir="ltr">node scripts/modules/install.mjs {m.id} --target &lt;repo&gt;</pre>
          <p>ושדה הגדרה אחד: {s.installConfig}</p>
        </Sec>
        <Sec id="settings" title="הגדרות">
          {props.length ? (
            <table className="sp-table"><thead><tr><th>שדה</th><th>סוג</th><th>ברירת מחדל</th><th>מה זה</th></tr></thead>
              <tbody>{props.map(([k, p]) => <tr key={k}><td className="fd-mono">{k}</td><td className="fd-mono">{p.type ?? '–'}</td><td className="fd-mono">{p.const !== undefined ? `${String(p.const)} (קבוע)` : p.default !== undefined ? JSON.stringify(p.default) : '–'}</td><td>{p.description_he ?? ''}</td></tr>)}</tbody></table>
          ) : <p>אין הגדרות מעבר לשדה ההתקנה. הפירוט המלא נמצא ב-README.</p>}
        </Sec>
        <Sec id="version" title="גרסה, שינויים ותאימות">
          <p><b>גרסה:</b> <span className="fd-mono">{m.version}</span> · <b>תאימות:</b> {s.compatibility}</p>
          <pre className="sp-changelog">{m.changelog.replace(/^# .*\n+/, '')}</pre>
        </Sec>
        <Sec id="tier" title="רמת הפצה"><p><b>{TIER_LABEL[m.distribution]}:</b> {TIER_MEANING[m.distribution]}</p></Sec>
        <Sec id="support" title="תמיכה ומגבלות"><p>{s.support}</p><h3>מגבלות ידועות</h3><L items={s.limitations} /></Sec>
      </article>
    </div>
  );
}
