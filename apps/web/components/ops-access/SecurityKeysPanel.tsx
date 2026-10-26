'use client';

import { useCallback, useEffect, useState } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import { KeyRound, Loader2, Plus, ShieldCheck, Trash2, Usb } from 'lucide-react';
import { StepUpDialog } from '@/components/admin/StepUpDialog';

type Key = { id: string; label: string; created_at: string; last_used_at: string | null };
const fmt = (s: string) => new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', year: '2-digit' }).format(new Date(s));
async function post(body: Record<string, unknown>) {
  const r = await fetch('/api/v1/ops/device/key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'include' });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; options?: unknown; stepUp?: boolean };
  return { ok: r.ok, status: r.status, j };
}

/** Ops → security: physical security keys (tap to approve a new device). Removing one needs a recovery code. */
export function SecurityKeysPanel() {
  const [keys, setKeys] = useState<Key[] | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [label, setLabel] = useState('');
  const [stepUp, setStepUp] = useState<null | (() => void)>(null);
  const [removing, setRemoving] = useState<Key | null>(null);
  const [code, setCode] = useState('');

  const load = useCallback(async () => {
    setLoadErr(false);
    const r = await fetch('/api/v1/ops/device/key', { credentials: 'include' }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
    if (!r) { setLoadErr(true); return; }
    setKeys(r.keys ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    setBusy('add'); setMsg(null);
    try {
      const o = await post({ action: 'register_options' });
      if (o.j.stepUp) { setBusy(null); setStepUp(() => () => void add()); return; }
      if (!o.ok || !o.j.options) throw new Error(o.j.error ?? 'לא הצלחתי להתחיל.');
      const att = await startRegistration({ optionsJSON: o.j.options as never });
      const v = await post({ action: 'register_verify', response: att, label: label.trim() || 'מפתח אבטחה' });
      if (!v.ok) throw new Error(v.j.error ?? 'המפתח לא נרשם.');
      setMsg({ tone: 'ok', text: 'המפתח נרשם. מעכשיו נגיעה בו מאשרת כניסה ממכשיר חדש.' }); setLabel(''); void load();
    } catch (e) {
      const n = (e as { name?: string }).name;
      setMsg({ tone: 'err', text: n === 'NotAllowedError' ? 'הפעולה בוטלה או שעבר הזמן. נסו שוב.' : (e as Error).message || 'לא הצלחתי לרשום את המפתח.' });
    } finally { setBusy(null); }
  };

  const remove = async () => {
    if (!removing) return;
    setBusy('remove'); setMsg(null);
    const r = await post({ action: 'remove', id: removing.id, code });
    setBusy(null);
    if (r.j.stepUp) { setStepUp(() => () => void remove()); return; }
    if (!r.ok) { setMsg({ tone: 'err', text: r.j.error ?? 'ההסרה נכשלה.' }); return; }
    setRemoving(null); setCode(''); setMsg({ tone: 'ok', text: 'המפתח הוסר.' }); void load();
  };

  return (
    <section dir="rtl" className="overflow-hidden rounded-3xl border border-forest-950/5 bg-gc shadow-[0_4px_20px_rgba(15,61,46,0.06)]">
      <StepUpDialog open={!!stepUp} purpose="ops.sensitive" reason="ניהול מפתחות אבטחה" onClose={() => setStepUp(null)} onVerified={() => { const f = stepUp; setStepUp(null); f?.(); }} />
      <div className="flex items-start gap-3 bg-gradient-to-l from-[#0f3d2e] to-[#14523d] px-5 py-4 text-[#f2f2f6]">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-on-dark/10 ring-1 ring-on-dark/20"><Usb className="h-5 w-5" /></span>
        <div>
          <h2 className="font-bold">מפתחות אבטחה פיזיים</h2>
          <p className="mt-0.5 text-xs text-[#f2f2f6]/80">נגיעה במפתח מאשרת כניסה ממכשיר חדש. אם המפתח לא זמין, אפשר להשתמש בקוד גיבוי חד-פעמי.</p>
        </div>
      </div>
      <div className="space-y-3 p-4">
        {keys === null && !loadErr && <div className="flex items-center gap-2 text-sm text-ink-faint"><Loader2 className="h-4 w-4 animate-spin" />טוען…</div>}
        {loadErr && <p className="text-sm text-coral-700" role="alert">לא הצלחתי לטעון את המפתחות. <button type="button" onClick={load} className="font-semibold underline">לנסות שוב</button></p>}
        {keys && (
          <ul className="space-y-2">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center justify-between gap-3 rounded-2xl bg-[#e8e8ed] px-3 py-2.5 text-sm">
                <span className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-[#0b6b4b]" /><span className="font-medium">{k.label}</span><span className="text-xs text-ink-faint">נוסף {fmt(k.created_at)}{k.last_used_at ? ` · שימוש אחרון ${fmt(k.last_used_at)}` : ''}</span></span>
                <button type="button" onClick={() => { setRemoving(k); setCode(''); }} aria-label={`הסרת ${k.label}`} className="rounded-xl p-2 text-coral-700 hover:bg-coral-50"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
            {!keys.length && <li className="rounded-2xl border border-dashed border-[#0b6b4b]/30 px-3 py-3 text-sm text-ink-soft">עדיין לא נרשם מפתח. כשתקבלו את המפתחות, חברו אחד ולחצו על &quot;הוספת מפתח&quot;. מומלץ לרשום שניים ולשמור אחד במקום אחר.</li>}
          </ul>
        )}
        {removing && (
          <div className="rounded-2xl border border-coral-200 bg-coral-50 p-3 text-sm">
            <p className="font-semibold text-coral-800">הסרת &quot;{removing.label}&quot; מחלישה את ההגנה, לכן צריך קוד גיבוי.</p>
            <input value={code} onChange={(e) => setCode(e.target.value)} dir="ltr" autoComplete="one-time-code" placeholder="XXXXX-XXXXX" className="mt-2 w-full rounded-xl border border-coral-200 bg-gc px-3 py-2 text-center font-mono" />
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={remove} disabled={busy === 'remove' || code.length < 8} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-coral-600 py-2 font-bold text-gc disabled:opacity-50">{busy === 'remove' && <Loader2 className="h-4 w-4 animate-spin" />}הסרה</button>
              <button type="button" onClick={() => setRemoving(null)} className="flex-1 rounded-xl bg-gc py-2 font-semibold text-ink-soft ring-1 ring-forest-950/10">ביטול</button>
            </div>
          </div>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <input value={label} onChange={(e) => setLabel(e.target.value.slice(0, 60))} placeholder="שם למפתח (למשל: מפתח ראשי)" className="flex-1 rounded-2xl border border-forest-950/10 bg-[#e8e8ed] px-3 py-2.5 text-sm" />
          <button type="button" onClick={add} disabled={!!busy || (keys?.length ?? 0) >= 5} className="flex items-center justify-center gap-2 rounded-2xl bg-[#0f3d2e] px-4 py-2.5 text-sm font-bold text-[#f2f2f6] shadow-lg shadow-primary-900/20 transition active:scale-[0.99] disabled:opacity-50">
            {busy === 'add' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}הוספת מפתח
          </button>
        </div>
        {msg && <p role={msg.tone === 'err' ? 'alert' : 'status'} className={msg.tone === 'err' ? 'flex items-center gap-1.5 text-sm text-coral-700' : 'flex items-center gap-1.5 text-sm text-[#0b6b4b]'}>{msg.tone === 'ok' && <ShieldCheck className="h-4 w-4" />}{msg.text}</p>}
      </div>
    </section>
  );
}
