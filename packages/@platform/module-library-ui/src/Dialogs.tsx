'use client';
import { useState } from 'react';
import type { RegistryModule } from './types';
import { downloadBase64, postJson } from './api';
import { fmtDate } from './labels';
import { TechDetails } from './TechDetails';

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

function Done({ out, note }: { out: PackOut; note: string }) {
  return (
    <div className="fd-result">
      <p className="fd-ok">✓ {note}</p>
      {out.lid ? <p>הרישיון בתוקף עד <b>{fmtDate(out.expiresAt ?? null)}</b>. אפשר לחדש או לחסום אותו בעמוד &quot;רישיונות&quot;.</p> : null}
      {out.base64 ? <button type="button" className="fd-btn" onClick={() => downloadBase64(out.fileName, out.base64!)}>להוריד שוב</button> : null}
      <TechDetails>
        <dl><dt>קובץ</dt><dd className="fd-mono">{out.fileName}</dd><dt>טביעת אצבע</dt><dd className="fd-mono fd-wrap">{out.sha256}</dd>{out.lid ? <><dt>מספר רישיון</dt><dd className="fd-mono">{out.lid}</dd></> : null}</dl>
        <ul className="fd-files">{out.files.map((f) => <li key={f} className="fd-mono">{f}</li>)}</ul>
      </TechDetails>
    </div>
  );
}

const finish = (setP: (p: Phase) => void) => (r: { ok: true; data: PackOut } | { ok: false; error: string }) => {
  if (!r.ok) return setP({ s: 'error', msg: r.error });
  if (r.data.base64) downloadBase64(r.data.fileName, r.data.base64);
  setP({ s: 'done', out: r.data });
};

export function ShareDialog({ m, api, onClose, initial }: { m: RegistryModule; api: string; onClose: () => void; initial?: Phase }) {
  const [p, setP] = useState<Phase>(initial ?? { s: 'idle' });
  const blocked = m.distribution === 'internal';
  const go = () => { setP({ s: 'busy' }); postJson<PackOut>(api, { kind: 'share', moduleId: m.id }, `שיתוף ${m.store.name}`, finish(setP)); };
  return (
    <Shell title={`שיתוף: ${m.store.name}`} onClose={onClose}>
      <p>מורידים קובץ אחד עם הרכיב, לשליחה למי שתרצו. בלי סיסמאות, בלי סודות ובלי רישיון.</p>
      {blocked ? <p className="fd-warn">הרכיב הזה פנימי ולא יוצא מהמערכת.</p> : null}
      {p.s === 'error' ? <p className="fd-err" role="alert">{p.msg}</p> : null}
      {p.s === 'done' ? <Done out={p.out} note="הקובץ ירד למחשב" /> : (
        <button type="button" className="fd-btn fd-btn-primary fd-btn-wide" disabled={blocked || p.s === 'busy'} onClick={go}>{p.s === 'busy' ? 'מכינים את הקובץ…' : 'הורדת קובץ לשיתוף'}</button>
      )}
      <TechDetails><p>קובץ <span className="fd-mono">.tgz</span> עם הקוד, <span className="fd-mono">module.json</span>, <span className="fd-mono">README.he.md</span>, <span className="fd-mono">llms.txt</span> ו-<span className="fd-mono">INTEGRITY.json</span> (טביעת אצבע לכל קובץ). המקבל מריץ אותו על השרתים שלו.</p></TechDetails>
    </Shell>
  );
}

const PERIODS = [[30, 'חודש'], [90, '3 חודשים'], [180, 'חצי שנה'], [365, 'שנה']] as const;
const refFromDomain = (d: string) => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

export function SellDialog({ m, api, signingReady, onClose, initial }: { m: RegistryModule; api: string; signingReady: boolean; onClose: () => void; initial?: Phase }) {
  const [p, setP] = useState<Phase>(initial ?? { s: 'idle' });
  const [name, setName] = useState(''); const [domain, setDomain] = useState(''); const [days, setDays] = useState(30);
  const sellable = m.distribution === 'sellable';
  const why = !sellable ? 'הרכיב הזה לא מסומן למכירה.' : !signingReady ? 'המכירה עוד לא הופעלה בשרת. אחרי הפעלה חד־פעמית היא תעבוד כאן.' : null;
  const go = () => {
    const host = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    setP({ s: 'busy' });
    postJson<PackOut>(api, { kind: 'sell', moduleId: m.id, licenseeRef: refFromDomain(host), licenseeName: name.trim() || undefined, domains: [host], validDays: days, mode: 'bundle' }, `מכירת ${m.store.name}`, finish(setP));
  };
  return (
    <Shell title={`מכירה: ${m.store.name}`} onClose={onClose}>
      <p>ממלאים שלושה פרטים ולוחצים. הקונה מקבל קובץ להתקנה, והרכיב עובד אצלו רק באתר שלו ועד סוף התקופה.</p>
      {why ? <p className="fd-warn">{why}</p> : null}
      {p.s === 'done' ? <Done out={p.out} note="נמכר. הקובץ לקונה ירד למחשב" /> : (
        <form className="fd-form" onSubmit={(e) => { e.preventDefault(); go(); }}>
          <label>שם הקונה<input value={name} onChange={(e) => setName(e.target.value)} placeholder="למשל: חנות הפרחים של דנה" disabled={!!why} /><small>נשמר מוצפן אצלנו בלבד.</small></label>
          <label>כתובת האתר של הקונה<input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="shop.example.com" dir="ltr" required disabled={!!why} /><small>הרכיב יעבוד רק בכתובת הזאת.</small></label>
          <label>לכמה זמן<select value={days} onChange={(e) => setDays(Number(e.target.value))} disabled={!!why}>{PERIODS.map(([d, t]) => <option key={d} value={d}>{t}{d === 30 ? ' (מומלץ)' : ''}</option>)}</select><small>בסוף התקופה הרכיב נעצר עד שמחדשים.</small></label>
          {p.s === 'error' ? <p className="fd-err" role="alert">{p.msg}</p> : null}
          <button type="submit" className="fd-btn fd-btn-primary fd-btn-wide" disabled={!!why || p.s === 'busy' || !domain.trim()}>{p.s === 'busy' ? 'מכינים…' : 'מכירה והורדת הקובץ לקונה'}</button>
        </form>
      )}
      <TechDetails><p>נוצר רישיון חתום דיגיטלית (Ed25519) שקשור לכתובת האתר ולטווח הגרסאות, וחבילה מכווצת עם סימן מים ומניפסט חתום. הכול רץ על השרתים של הקונה. ההפעלה בשרת דורשת את <span className="fd-mono">LICENSE_SIGNING_KEY</span>. מכירת קוד מלא לא זמינה מהמסך הזה.</p></TechDetails>
    </Shell>
  );
}
