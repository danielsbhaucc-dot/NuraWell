'use client';
import { useEffect, useState } from 'react';
import type { LicenseRow } from './types';
import { postJson } from './api';
import { STATE_LABEL, fmtDate } from './labels';

type Load = { s: 'loading' } | { s: 'error'; msg: string } | { s: 'ok'; rows: LicenseRow[]; signingReady: boolean };
type RevState = 'suspended_until' | 'suspended_until_payment' | 'revoked_permanent';

export function LicensesView({ api, initial }: { api: string; initial?: Load }) {
  const [load, setLoad] = useState<Load>(initial ?? { s: 'loading' });
  const [msg, setMsg] = useState<string | null>(null);
  const [rev, setRev] = useState<{ lid: string; state: RevState; until: string; reason: string } | null>(null);
  const refresh = () => postJson<{ licenses: LicenseRow[]; signingReady: boolean }>(api, { op: 'list' }, 'רשימת רישיונות', (r) => setLoad(r.ok ? { s: 'ok', rows: r.data.licenses, signingReady: r.data.signingReady } : { s: 'error', msg: r.error }));
  useEffect(() => { if (!initial) refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const act = (body: Record<string, unknown>, label: string) => postJson(api, body, label, (r) => { setMsg(r.ok ? `✓ ${label}` : r.error); if (r.ok) { setRev(null); refresh(); } });

  if (load.s === 'loading') return <div className="fd-empty">טוענים רישיונות…</div>;
  if (load.s === 'error') return <div className="fd-empty fd-err" role="alert">{load.msg}</div>;
  const soon = (iso: string | null) => iso !== null && Date.parse(iso) - Date.now() < 7 * 86_400_000;
  return (
    <div className="fd-pane">
      <h2>רישיונות</h2>
      <p className="fd-dim">כל רישיון תקף לתקופה (ברירת מחדל 30 יום). השעיה וביטול מתפרסמים ברשימת חסימות חתומה. אין מחיקה מרחוק של קבצים אצל הקונה.</p>
      {!load.signingReady ? <p className="fd-warn">מפתח החתימה לא הוגדר, ולכן אפשר רק לצפות.</p> : null}
      {msg ? <p className="fd-note" role="status">{msg}</p> : null}
      {load.rows.length === 0 ? <div className="fd-empty">עוד לא הונפקו רישיונות.</div> : (
        <div className="fd-list" role="table">
          <div className="fd-row fd-head fd-row-lic" role="row"><span>רישיון</span><span>מודול</span><span>לקוח</span><span>בתוקף עד</span><span>מצב</span><span>פעולות</span></div>
          {load.rows.map((l) => (
            <div key={l.lid} className="fd-row fd-row-lic" role="row">
              <span className="fd-mono">{l.lid}</span><span>{l.moduleId}</span><span className="fd-mono">{l.licensee}</span>
              <span className={soon(l.expiresAt) ? 'fd-soon' : ''}>{fmtDate(l.expiresAt)}</span>
              <span>{STATE_LABEL[l.state]}{l.until ? ` (${fmtDate(l.until)})` : ''}</span>
              <span className="fd-actions">
                <button type="button" className="fd-btn" disabled={!load.signingReady} onClick={() => act({ op: 'renew', lid: l.lid, validDays: 30 }, 'הרישיון חודש ל-30 יום')}>חידוש</button>
                {l.state === 'active'
                  ? <button type="button" className="fd-btn fd-btn-danger" disabled={!load.signingReady} onClick={() => setRev({ lid: l.lid, state: 'suspended_until_payment', until: '', reason: '' })}>חסימה</button>
                  : <button type="button" className="fd-btn" disabled={!load.signingReady} onClick={() => act({ op: 'reinstate', lid: l.lid }, 'הרישיון הוחזר לפעולה')}>החזרה</button>}
              </span>
            </div>
          ))}
        </div>
      )}
      {rev ? (
        <form className="fd-form fd-inline" onSubmit={(e) => { e.preventDefault(); act({ op: 'revoke', lid: rev.lid, state: rev.state, until: rev.until || null, reason: rev.reason }, 'החסימה נשמרה ופורסמה'); }}>
          <h3>חסימת {rev.lid}</h3>
          <fieldset><legend>סוג חסימה</legend>
            {(['suspended_until', 'suspended_until_payment', 'revoked_permanent'] as const).map((s) => <label key={s}><input type="radio" checked={rev.state === s} onChange={() => setRev({ ...rev, state: s })} /> {STATE_LABEL[s]}</label>)}
          </fieldset>
          {rev.state === 'suspended_until' ? <label>עד תאריך<input type="date" value={rev.until} onChange={(e) => setRev({ ...rev, until: e.target.value })} /></label> : null}
          <label>סיבה (נשמרת מוצפנת, רק אצלנו)<textarea value={rev.reason} onChange={(e) => setRev({ ...rev, reason: e.target.value })} rows={2} /></label>
          <div className="fd-actions"><button type="submit" className="fd-btn fd-btn-danger">שמירה ופרסום</button><button type="button" className="fd-btn" onClick={() => setRev(null)}>ביטול</button></div>
        </form>
      ) : null}
    </div>
  );
}
