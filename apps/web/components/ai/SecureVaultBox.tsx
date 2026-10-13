'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { VAULT_KINDS, VAULT_KIND_LABEL, type VaultKind } from '@/lib/secure-vault/crypto-labels';

/** Generic mode (onboarding profile fields): same UI, caller-owned submit; nothing goes through AI. */
export type SecureField = { label: string; placeholder?: string; numeric?: boolean; submit: (value: string) => Promise<boolean> };
type Props = { onSaved?: (notice: string) => void; onClose: () => void; field?: SecureField };
const GLYPHS = '#%&@$*7A9X';

/** Vault-style secure input (approved design). The value goes only to /api/v1/secure-vault — never into chat or AI. */
export function SecureVaultBox({ onSaved, onClose, field }: Props) {
  const [kind, setKind] = useState<VaultKind>('id');
  const [value, setValue] = useState('');
  const [state, setState] = useState<'idle' | 'typing' | 'busy' | 'sealed' | 'error'>('idle');
  const [flash, setFlash] = useState('');
  const [ref, setRef] = useState('');
  const inputId = useId();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const onChange = (v: string) => {
    setValue(v);
    setState(v ? 'typing' : 'idle');
    setFlash(GLYPHS[Math.floor(Math.random() * GLYPHS.length)]);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setFlash(''), 450);
  };

  const save = async () => {
    if (value.trim().length < 2 || state === 'busy') return;
    setState('busy');
    try {
      if (field) {
        const ok = await field.submit(value);
        if (!ok) throw new Error('save');
        setValue('');
        setRef('');
        setState('sealed');
        return;
      }
      const res = await fetch('/api/v1/secure-vault', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, value }),
      });
      const j = (await res.json().catch(() => ({}))) as { ref?: string; notice?: string };
      if (!res.ok || !j.ref || !j.notice) throw new Error('save');
      setValue('');
      setRef(j.ref);
      setState('sealed');
      onSaved?.(j.notice);
    } catch {
      setState('error');
    }
  };

  const masked = '•'.repeat(Math.max(0, value.length - (flash ? 1 : 0)));
  const vs = state === 'busy' ? 'typing' : state === 'error' ? 'typing' : state;

  return (
    <section className={`nw-vault nw-vault--${vs}`} role="region" aria-label="כספת מידע רגיש" dir="rtl">
      <style>{VAULT_CSS}</style>
      <button type="button" className="nw-vault__x" onClick={onClose} aria-label="סגור כספת">×</button>
      <div className="nw-vault__head">
        <div className="nw-vault__lock" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ecfdf5" strokeWidth="2.2" strokeLinecap="round">
            <path className="nw-vault__shackle" d="M7 11V8a5 5 0 0 1 10 0v3" />
            <rect x="4.5" y="11" width="15" height="10" rx="3" fill="#ecfdf522" />
            <circle cx="12" cy="16" r="1.4" fill="#ecfdf5" />
          </svg>
        </div>
        <div>
          <h3>כספת מאובטחת</h3>
          <div className="nw-vault__sub">{field ? 'נשמר ישירות בפרופיל • לא עובר דרך ה-AI' : 'מוצפן אצלנו • לא נשלח לאלמוג או ל-AI'}</div>
        </div>
      </div>

      {state !== 'sealed' ? (
        <div>
          {field ? null : <div className="nw-vault__kinds" role="radiogroup" aria-label="סוג הפריט">
            {VAULT_KINDS.map((k) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
                {VAULT_KIND_LABEL[k]}
              </button>
            ))}
          </div>}
          <label className="nw-vault__sub nw-vault__label" htmlFor={inputId}>{field ? field.label : VAULT_KIND_LABEL[kind]}</label>
          <div className="nw-vault__field">
            <input
              id={inputId}
              type="password"
              inputMode={(field ? field.numeric : ['id', 'card', 'bank', 'phone'].includes(kind)) ? 'decimal' : 'text'}
              placeholder={field?.placeholder}
              autoComplete="off"
              spellCheck={false}
              value={value}
              maxLength={500}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void save(); } }}
              aria-describedby={`${inputId}-n`}
            />
            <div className="nw-vault__mask" aria-hidden="true">
              {masked}
              {flash ? <span className="nw-vault__ch" key={value.length}>{flash}</span> : null}
              <span className="nw-vault__caret" />
            </div>
          </div>
          <div className="nw-vault__meter" aria-live="polite">
            <span className="nw-vault__dot" />
            {state === 'error' ? 'לא הצלחנו לשמור. אפשר לנסות שוב.' : state === 'busy' ? 'נועל…' : value ? 'מצפין תוך כדי הקלדה…' : 'מוכן להצפנה'}
          </div>
          <button type="button" className="nw-vault__btn" onClick={() => void save()} disabled={value.trim().length < 2 || state === 'busy'}>
            {field ? '🔐 שליחה מאובטחת' : '🔐 נעילה בכספת'}
          </button>
          <div className="nw-vault__note" id={`${inputId}-n`}>{field ? 'הערך נשמר בפרופיל שלך בלבד. בשיחה יופיע רק "נשלח בערוץ מאובטח".' : 'רק אתה יכול לראות את הערך. בשיחה הוא יופיע רק כקוד הפניה.'}</div>
        </div>
      ) : (
        <div className="nw-vault__ok" role="status">
          <div className="nw-vault__ring">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </div>
          <b>נשמר ונעול 🔒</b>
          {ref ? (<><p>מוצפן ב-AES-256. אלמוג רואה רק את ההפניה:</p><span className="nw-vault__chip">{ref}</span></>) : <p>נשמר בפרופיל, בלי לעבור דרך ה-AI.</p>}
        </div>
      )}
    </section>
  );
}

const VAULT_CSS = `
.nw-vault{position:relative;border-radius:26px;padding:20px 18px 18px;margin:8px 0;color:#ecfdf5;background:linear-gradient(160deg,#064e3b,#065f46 55%,#047857);border:1px solid #6ee7b740;box-shadow:0 20px 50px #0008,inset 0 1px 0 #a7f3d055;overflow:hidden}
.nw-vault:before{content:"";position:absolute;inset:-40%;background:conic-gradient(from 0deg,transparent,#34d39933,transparent 30%);animation:nwv-spin 7s linear infinite;pointer-events:none}
.nw-vault>*{position:relative}
.nw-vault__x{position:absolute;top:10px;left:12px;z-index:2;background:none;border:0;color:#a7f3d0;font-size:22px;line-height:1;cursor:pointer}
.nw-vault__head{display:flex;align-items:center;gap:12px}
.nw-vault h3{margin:0;font-size:17px;font-weight:700}
.nw-vault__sub{font-size:12.5px;color:#a7f3d0;margin-top:2px}
.nw-vault__label{display:block;margin-top:12px}
.nw-vault__lock{width:52px;height:52px;border-radius:18px;display:grid;place-items:center;background:radial-gradient(circle at 30% 30%,#34d399,#047857);animation:nwv-pulse 2.4s infinite}
.nw-vault__shackle{transform-origin:70% 100%;transition:transform .5s cubic-bezier(.5,1.8,.5,1);transform:translateY(-3px) rotate(-18deg)}
.nw-vault--sealed .nw-vault__shackle{transform:none}
.nw-vault__kinds{display:flex;flex-wrap:wrap;gap:6px;margin-top:14px}
.nw-vault__kinds button{border:1px solid #34d39955;background:#022c2288;color:#a7f3d0;border-radius:999px;padding:5px 10px;font-size:12px;cursor:pointer}
.nw-vault__kinds button.on{background:#34d399;color:#064e3b;font-weight:700}
.nw-vault__field{position:relative;margin-top:6px;border-radius:16px;background:#022c22cc;border:1.5px solid #34d39955;min-height:58px;transition:border-color .3s,box-shadow .3s}
.nw-vault--typing .nw-vault__field,.nw-vault__field:focus-within{border-color:#34d399;box-shadow:0 0 0 4px #34d39922}
.nw-vault__field input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:text;font-size:16px}
.nw-vault__mask{padding:14px;font:600 18px/1.4 ui-monospace,monospace;letter-spacing:2px;direction:ltr;text-align:right;color:#6ee7b7;pointer-events:none;overflow:hidden;white-space:nowrap}
.nw-vault__ch{display:inline-block;color:#fbbf24;animation:nwv-scr .45s steps(6)}
.nw-vault__caret{display:inline-block;width:2px;height:20px;background:#6ee7b7;vertical-align:middle;margin-inline-start:2px;animation:nwv-bl 1s steps(1) infinite}
.nw-vault__meter{display:flex;gap:6px;margin-top:10px;font-size:11.5px;color:#a7f3d0;align-items:center}
.nw-vault__dot{width:7px;height:7px;border-radius:50%;background:#34d399;animation:nwv-pulse 1.6s infinite}
.nw-vault__btn{margin-top:14px;width:100%;border:0;border-radius:16px;padding:14px;font-weight:700;font-size:16px;color:#064e3b;background:linear-gradient(135deg,#a7f3d0,#34d399);box-shadow:0 8px 20px #10b98155;cursor:pointer}
.nw-vault__btn:disabled{opacity:.55}
.nw-vault__btn:focus-visible,.nw-vault__kinds button:focus-visible,.nw-vault__x:focus-visible{outline:2px solid #fbbf24;outline-offset:2px}
.nw-vault__note{font-size:11.5px;color:#a7f3d0cc;margin-top:10px;line-height:1.6}
.nw-vault__ok{text-align:center;padding:10px 0}
.nw-vault__ok p{font-size:12.5px;color:#a7f3d0;margin:6px 0 0}
.nw-vault__ring{width:84px;height:84px;margin:6px auto 10px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle,#10b981,#047857);box-shadow:0 0 30px #34d39988;animation:nwv-pop .6s cubic-bezier(.3,1.6,.5,1)}
.nw-vault__chip{display:inline-block;margin-top:10px;font:600 12px monospace;background:#022c22;border:1px solid #34d39966;border-radius:999px;padding:5px 10px;direction:ltr}
@keyframes nwv-spin{to{transform:rotate(360deg)}}
@keyframes nwv-pulse{0%{box-shadow:0 0 0 0 #34d39980}70%{box-shadow:0 0 0 14px #34d39900}100%{box-shadow:0 0 0 0 #34d39900}}
@keyframes nwv-scr{0%{transform:translateY(-4px)}100%{transform:none}}
@keyframes nwv-bl{50%{opacity:0}}
@keyframes nwv-pop{0%{transform:scale(.3);opacity:0}}
@media (prefers-reduced-motion:reduce){.nw-vault *,.nw-vault:before{animation:none!important;transition:none!important}}
`;
