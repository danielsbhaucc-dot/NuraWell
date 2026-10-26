'use client';
import { useState } from 'react';
import type { RegistryModule } from './types';
import { downloadBase64, postJson } from './api';
import { fmtDate } from './labels';

export type PackOut = { fileName: string; sha256: string; files: string[]; base64?: string; lid?: string; expiresAt?: string | null };
type Phase = { s: 'idle' } | { s: 'busy' } | { s: 'error'; msg: string } | { s: 'done'; out: PackOut };

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fd-modal-back" onClick={onClose}>
      <div className="fd-modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="fd-close" onClick={onClose} aria-label="סגירה">×</button>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

function Result({ out, note }: { out: PackOut; note: string }) {
  return (
    <div className="fd-result">
      <p className="fd-ok">✓ {note}</p>
      <dl>
        <dt>קובץ</dt><dd className="fd-mono">{out.fileName}</dd>
        <dt>טביעת אצבע (SHA-256)</dt><dd className="fd-mono fd-wrap">{out.sha256}</dd>
        {out.lid ? <><dt>מזהה רישיון</dt><dd className="fd-mono">{out.lid}</dd><dt>בתוקף עד</dt><dd>{fmtDate(out.expiresAt ?? null)}</dd></> : null}
      </dl>
      <details><summary>{out.files.length} קבצים בחבילה</summary><ul className="fd-files">{out.files.map((f) => <li key={f} className="fd-mono">{f}</li>)}</ul></details>
      {out.base64 ? <button type="button" className="fd-btn fd-btn-primary" onClick={() => downloadBase64(out.fileName, out.base64!)}>הורדת החבילה</button> : null}
    </div>
  );
}

export function ShareDialog({ m, api, onClose, initial }: { m: RegistryModule; api: string; onClose: () => void; initial?: Phase }) {
  const [p, setP] = useState<Phase>(initial ?? { s: 'idle' });
  const blocked = m.distribution === 'internal';
  const go = () => { setP({ s: 'busy' }); postJson<PackOut>(api, { kind: 'share', moduleId: m.id }, `שיתוף המודול ${m.store.name}`, (r) => setP(r.ok ? { s: 'done', out: r.data } : { s: 'error', msg: r.error })); };
  return (
    <Shell title={`שיתוף: ${m.store.name}`} onClose={onClose}>
      <p>שיתוף יוצר קובץ <b>.tgz</b> עם הקוד המלא של המודול, <span className="fd-mono">module.json</span>, <span className="fd-mono">README.he.md</span>, <span className="fd-mono">llms.txt</span> וקובץ <span className="fd-mono">INTEGRITY.json</span> עם טביעת אצבע לכל קובץ. אין בו מפתחות, קובצי סביבה או סודות, ואין רישיון. מי שמקבל אותו מריץ אותו על השרתים שלו.</p>
      {blocked ? <p className="fd-warn">המודול הזה פנימי ולא יוצא מהמערכת.</p> : null}
      {p.s === 'error' ? <p className="fd-err" role="alert">{p.msg}</p> : null}
      {p.s === 'done' ? <Result out={p.out} note="החבילה מוכנה" /> : (
        <button type="button" className="fd-btn fd-btn-primary" disabled={blocked || p.s === 'busy'} onClick={go}>{p.s === 'busy' ? 'יוצרים חבילה…' : 'יצירת חבילה לשיתוף'}</button>
      )}
    </Shell>
  );
}

export function SellDialog({ m, api, signingReady, onClose, initial }: { m: RegistryModule; api: string; signingReady: boolean; onClose: () => void; initial?: Phase }) {
  const [p, setP] = useState<Phase>(initial ?? { s: 'idle' });
  const [ref, setRef] = useState(''); const [name, setName] = useState(''); const [domains, setDomains] = useState(''); const [days, setDays] = useState(30);
  const [mode, setMode] = useState<'bundle' | 'source'>('bundle');
  const sellable = m.distribution === 'sellable';
  const why = !sellable ? 'המודול הזה לא מסומן "למכירה". את ההחלטה אילו מודולים נמכרים צריך לקבל לפני שאפשר למכור.' : !signingReady ? 'מפתח החתימה לרישיונות עוד לא הוגדר בשרת, ולכן מכירה כבויה כרגע.' : null;
  const go = () => { setP({ s: 'busy' }); postJson<PackOut>(api, { kind: 'sell', moduleId: m.id, licenseeRef: ref, licenseeName: name || undefined, domains: domains.split(/[\s,]+/), validDays: days, mode }, `מכירת המודול ${m.store.name}`, (r) => setP(r.ok ? { s: 'done', out: r.data } : { s: 'error', msg: r.error })); };
  return (
    <Shell title={`מכירה: ${m.store.name}`} onClose={onClose}>
      <p>מכירה מנפיקה <b>רישיון חתום</b> ללקוח אחד ויוצרת חבילה בשבילו. הכול רץ <b>על השרתים של הקונה</b>, ומפתחות ההצפנה של המידע שלו נוצרים אצלו. בחבילה (ברירת המחדל) יש קוד מכווץ עם סימן מים, מניפסט חתום, הרישיון, מפתח ציבורי ותנאי רישיון. ההתקנה היא פקודה אחת ושדה הגדרה אחד: הרישיון. כשהרישיון פג או בוטל, המודול ננעל עם הודעה בעברית בלי להפיל את האתר.</p>
      {why ? <p className="fd-warn">{why}</p> : null}
      {p.s === 'done' ? <Result out={p.out} note="הרישיון הונפק והחבילה מוכנה" /> : (
        <form className="fd-form" onSubmit={(e) => { e.preventDefault(); go(); }}>
          <label>מזהה לקוח (באנגלית, בלי פרטים אישיים)<input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="acme-shop" disabled={!!why} /></label>
          <label>שם הלקוח (נשמר מוצפן, לא נכנס לרישיון)<input value={name} onChange={(e) => setName(e.target.value)} disabled={!!why} /></label>
          <label>דומיינים (מופרדים בפסיק)<input value={domains} onChange={(e) => setDomains(e.target.value)} placeholder="shop.example.com" dir="ltr" disabled={!!why} /></label>
          <label>תוקף בימים<input type="number" min={1} max={365} value={days} onChange={(e) => setDays(Number(e.target.value))} disabled={!!why} /></label>
          <fieldset disabled={!!why}><legend>סוג מכירה</legend>
            <label><input type="radio" checked={mode === 'bundle'} onChange={() => setMode('bundle')} /> חבילה מכווצת לתקופה</label>
            <label><input type="radio" checked={mode === 'source'} onChange={() => setMode('source')} disabled={!m.sale?.modes.includes('source')} /> קוד מלא (רכישה מלאה)</label>
          </fieldset>
          {p.s === 'error' ? <p className="fd-err" role="alert">{p.msg}</p> : null}
          <button type="submit" className="fd-btn fd-btn-primary" disabled={!!why || p.s === 'busy'}>{p.s === 'busy' ? 'מנפיקים…' : 'הנפקת רישיון ויצירת חבילה'}</button>
        </form>
      )}
    </Shell>
  );
}
