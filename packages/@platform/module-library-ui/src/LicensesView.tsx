'use client';
import { useEffect, useState } from 'react';
import type { LicenseRow } from './types';
import { postJson } from './api';
import { STATE_LABEL, fmtDate } from './labels';
import { TechDetails } from './TechDetails';
import { OneTimeKey } from './OneTimeKey';

type Load = { s: 'loading' } | { s: 'error'; msg: string } | { s: 'ok'; rows: LicenseRow[]; signingReady: boolean };
type RevState = 'suspended_until' | 'suspended_until_payment' | 'revoked_permanent';
const REASONS: [string, string][] = [['unpaid', 'לא שולם'], ['terms', 'הפרת תנאי השימוש'], ['buyer_request', 'בקשת הקונה'], ['other', 'אחר']];
const reasonLabel = (c: string) => REASONS.find(([k]) => k === c)?.[1] ?? c;
const STATES: [RevState, string, string][] = [
  ['suspended_until_payment', 'השהיה עד תשלום', 'הרכיב נעצר עד שתחזירו אותו לפעולה.'],
  ['suspended_until', 'השהיה לחודש', 'הרכיב נעצר וחוזר לעבוד לבד בעוד 30 יום.'],
  ['revoked_permanent', 'ביטול לתמיד', 'הרכיב נעצר ולא יחזור לעבוד.'],
];
const plus30 = () => new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

export function LicensesView({ api, initial, initialRevoke, initialUnblock, initialRotate, moduleName }: { api: string; initial?: Load; initialRevoke?: string; initialUnblock?: string; initialRotate?: { lid: string; secret?: string }; moduleName?: (id: string) => string }) {
  const [load, setLoad] = useState<Load>(initial ?? { s: 'loading' });
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [rev, setRev] = useState<{ lid: string; state: RevState; reason: string } | null>(initialRevoke ? { lid: initialRevoke, state: 'suspended_until_payment', reason: 'unpaid' } : null);
  const [unb, setUnb] = useState<string | null>(initialUnblock ?? null);
  const [rot, setRot] = useState<{ lid: string; secret?: string } | null>(initialRotate ?? null);
  const refresh = () => postJson<{ licenses: LicenseRow[]; signingReady: boolean }>(api, { op: 'list' }, 'טעינת הרישיונות', (r) => setLoad(r.ok ? { s: 'ok', rows: r.data.licenses, signingReady: r.data.signingReady } : { s: 'error', msg: r.error }));
  useEffect(() => { if (!initial) refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const act = (body: Record<string, unknown>, label: string) => postJson(api, body, label, (r) => { setMsg(r.ok ? { ok: true, t: `✓ ${label}` } : { ok: false, t: r.error }); if (r.ok) { setRev(null); setUnb(null); refresh(); } });
  const rotate = (lid: string) => postJson<{ secret: string }>(api, { op: 'rotate', lid }, 'החלפת מפתח', (r) => { if (r.ok) setRot({ lid, secret: r.data.secret }); else { setRot(null); setMsg({ ok: false, t: r.error }); } });
  const name = (id: string) => moduleName?.(id) ?? id;

  if (load.s === 'loading') return <div className="fd-empty">טוענים רישיונות…</div>;
  if (load.s === 'error') return <div className="fd-empty fd-err" role="alert">לא הצלחנו לטעון את הרישיונות. {load.msg}</div>;
  const soon = (iso: string | null) => iso !== null && Date.parse(iso) - Date.now() < 7 * 86_400_000;
  const target = rev ? load.rows.find((l) => l.lid === rev.lid) : null;
  const rotRow = rot ? load.rows.find((l) => l.lid === rot.lid) : null;
  const unbRow = unb ? load.rows.find((l) => l.lid === unb) : null;
  return (
    <div className="fd-pane">
      <h2>רישיונות</h2>
      <p className="fd-dim">כל מכירה יוצרת רישיון. <b>חידוש</b> מאריך עד החיוב הבא, <b>חסימה</b> עוצרת תוך כשתי דקות, <b>ביטול חסימה</b> מחזיר באותה מהירות, ו<b>מפתח חדש</b> מחליף מפתח שדלף. כל פעולה = כפתור אחד.</p>
      {!load.signingReady ? <p className="fd-warn">הרישיונות עוד לא הופעלו בשרת, ולכן כרגע אפשר רק לצפות.</p> : null}
      {msg ? <p className={msg.ok ? 'fd-note' : 'fd-err'} role={msg.ok ? 'status' : 'alert'}>{msg.t}</p> : null}
      {load.rows.length === 0 ? <div className="fd-empty">עוד לא נמכר אף רכיב. מוכרים מתוך ספריית המודולים, בכפתור &quot;מכירה&quot;.</div> : (
        <div className="fd-list" role="table">
          <div className="fd-row fd-head fd-row-lic" role="row"><span>קונה</span><span>רכיב</span><span>אתר</span><span>בתוקף עד</span><span>מצב</span><span>פעולות</span></div>
          {load.rows.map((l) => (
            <div key={l.lid} className="fd-row fd-row-lic" role="row">
              <span>{l.licensee}</span><span>{name(l.moduleId)}</span><span dir="ltr">{l.domains?.[0] ?? '–'}</span>
              <span className={soon(l.expiresAt) ? 'fd-soon' : ''}>{fmtDate(l.expiresAt)}</span>
              <span>{STATE_LABEL[l.state]}{l.until ? ` (${fmtDate(l.until)})` : ''}</span>
              <span className="fd-actions">
                <button type="button" className="fd-btn" disabled={!load.signingReady} onClick={() => act({ op: 'renew', lid: l.lid, validDays: 30 }, 'הרישיון הוארך בחודש')}>חידוש</button>
                {l.state === 'active'
                  ? <button type="button" className="fd-btn fd-btn-danger" disabled={!load.signingReady} onClick={() => setRev({ lid: l.lid, state: 'suspended_until_payment', reason: 'unpaid' })}>חסימה</button>
                  : <button type="button" className="fd-btn" disabled={!load.signingReady} onClick={() => setUnb(l.lid)}>ביטול חסימה</button>}
                <button type="button" className="fd-btn" disabled={!load.signingReady} onClick={() => setRot({ lid: l.lid })}>מפתח חדש</button>
              </span>
            </div>
          ))}
        </div>
      )}
      {rev ? (
        <div className="fd-modal-back" onClick={() => setRev(null)}>
          <form className="fd-modal fd-form" role="dialog" aria-modal="true" aria-label="חסימת רישיון" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); act({ op: 'revoke', lid: rev.lid, state: rev.state, until: rev.state === 'suspended_until' ? plus30() : null, reason: reasonLabel(rev.reason), reasonCode: rev.reason }, 'החסימה נשמרה'); }}>
            <button type="button" className="fd-close" onClick={() => setRev(null)} aria-label="סגירה">×</button>
            <h3>חסימה{target ? `: ${target.licensee}` : ''}</h3>
            <p>הרכיב ייעצר אצל הקונה תוך כשתי דקות. הקבצים שלו לא נמחקים, ואפשר לבטל בכל רגע.</p>
            <label>למה?<select value={rev.reason} onChange={(e) => setRev({ ...rev, reason: e.target.value })}>{REASONS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select><small>הקונה רואה רק את סוג הסיבה, בלי פרטים.</small></label>
            <fieldset className="fd-choices"><legend>מה לעשות?</legend>
              {STATES.map(([s, t, d]) => <label key={s} className={`fd-choice ${rev.state === s ? 'is-on' : ''}`}><input type="radio" name="st" checked={rev.state === s} onChange={() => setRev({ ...rev, state: s })} /><span><b>{t}</b><small>{d}</small></span></label>)}
            </fieldset>
            <button type="submit" className="fd-btn fd-btn-danger fd-btn-wide">חסימה</button>
            <TechDetails><p>מספר רישיון: <span className="fd-mono">{rev.lid}</span>. מעדכנים קובץ סטטוס חתום שהקונה קורא כל כשתי דקות. אם הקובץ לא נגיש יותר מ-6 שעות, הרכיב נעצר עד שהבדיקה חוזרת. נתיב &quot;מוח מרחוק&quot; (חסימה בשניות) הוא אופציה יקרה בנפרד.</p></TechDetails>
          </form>
        </div>
      ) : null}
      {unb ? (
        <div className="fd-modal-back" onClick={() => setUnb(null)}>
          <div className="fd-modal fd-form" role="dialog" aria-modal="true" aria-label="ביטול חסימה" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="fd-close" onClick={() => setUnb(null)} aria-label="סגירה">×</button>
            <h3>ביטול חסימה{unbRow ? `: ${unbRow.licensee}` : ''}</h3>
            <p>הרכיב יחזור לעבוד אצל הקונה תוך כשתי דקות. אין צורך לשלוח לו קובץ חדש.</p>
            <button type="button" className="fd-btn fd-btn-primary fd-btn-wide" onClick={() => act({ op: 'reinstate', lid: unb }, 'הרכיב חזר לעבוד אצל הקונה')}>ביטול החסימה</button>
          </div>
        </div>
      ) : null}
      {rot ? (
        <div className="fd-modal-back" onClick={() => setRot(null)}>
          <div className="fd-modal fd-form" role="dialog" aria-modal="true" aria-label="מפתח חדש" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="fd-close" onClick={() => setRot(null)} aria-label="סגירה">×</button>
            <h3>מפתח חדש{rotRow ? `: ${rotRow.licensee}` : ''}</h3>
            {rot.secret ? <OneTimeKey secret={rot.secret} /> : <>
              <p>אם המפתח של הקונה דלף. המפתח הישן מפסיק לעבוד תוך שניות, ואת החדש מעבירים לקונה.</p>
              <button type="button" className="fd-btn fd-btn-primary fd-btn-wide" onClick={() => rotate(rot.lid)}>יצירת מפתח חדש</button>
            </>}
          </div>
        </div>
      ) : null}
    </div>
  );
}
