'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Loader2, Mail, ScanFace, X } from 'lucide-react';
import { opsGlassBtnClass, opsGlassCardClass } from '@/components/admin/OpsPanel';
import { cn } from '@/lib/cn';
import { StepUpDialog } from '@/components/admin/StepUpDialog';

type Item = { id: string; kind: string; label: string; case_ref: string; file_name: string; format: string; created_at: string; expires_at: string };
const API = '/api/v1/ops/legal/passwords';
const fmt = (iso: string) => new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Jerusalem' }).format(new Date(iso));
const daysLeft = (iso: string) => Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86400_000));
const KIND: Record<string, string> = { consent: 'תיק הסכמה', media: 'תיק מדיה', platform_logs: 'יומני ספק' };

/**
 * Ops "משפטי" → סיסמאות. Passwords are never in the list; each reveal needs a fresh Face ID / passkey
 * and is logged, as are copy and "send to someone" (which only prepares a draft; nothing is sent).
 */
export function AdminLegalPasswords({ refreshKey = 0 }: { refreshKey?: number }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [shown, setShown] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ item: Item; to: string; text: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(API, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => setItems(d.items)).catch(() => setErr('לא הצלחנו לטעון את הסיסמאות'));
  }, []);
  useEffect(load, [load, refreshKey]);

  const log = (id: string, action: 'copy' | 'draft') => fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'log', id, action }) }).catch(() => undefined);

  const [pending, setPending] = useState<Item | null>(null);
  const reveal = (it: Item) => { setErr(null); setPending(it); };
  const afterStepUp = async () => {
    const it = pending; setPending(null); if (!it) return;
    setBusy(it.id);
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'reveal', id: it.id }) });
      if (!r.ok) throw new Error(r.status === 401 ? 'auth' : 'x');
      const d = await r.json();
      setShown((s) => ({ ...s, [it.id]: d.password }));
    } catch (e) {
      setErr(e instanceof Error && e.message === 'auth' ? 'האימות לא עבר. נסו שוב.' : 'לא הצלחנו להציג את הסיסמה');
    } finally { setBusy(null); }
  };

  const copy = async (it: Item) => {
    const pw = shown[it.id]; if (!pw) return;
    try { await navigator.clipboard.writeText(pw); setCopied(it.id); setTimeout(() => setCopied(null), 1800); void log(it.id, 'copy'); } catch { setErr('ההעתקה נחסמה בדפדפן'); }
  };

  const openDraft = (it: Item) => {
    const pw = shown[it.id]; if (!pw) return;
    setDraft({ item: it, to: '', text: `שלום,\nהסיסמה לפתיחת הקובץ "${it.file_name}" (${it.label}) היא:\n${pw}\n\nמומלץ לשלוח את הקובץ ואת הסיסמה בשני ערוצים נפרדים. הסיסמה בתוקף 7 ימים.\n\nבברכה,\nדניאל רחמן` });
    void log(it.id, 'draft');
  };

  return (
    <section dir="rtl" className={cn(opsGlassCardClass, 'p-4 sm:p-5')} aria-label="סיסמאות" data-testid="legal-passwords">
      <h2 className="mb-1 flex items-center gap-2 font-bold text-ink"><KeyRound size={18} className="text-accent-600" />סיסמאות</h2>
      <p className="mb-3 text-[13px] text-ink-soft">כל קובץ ראיות מוצפן בסיסמה משלו. להצגה מאשרים עם הטלפון (Face ID), קוד מאפליקציה או קוד גיבוי, וכל הצגה נרשמת. הסיסמה נמחקת יחד עם הקובץ אחרי 7 ימים.</p>
      {err ? <p role="alert" className="mb-3 rounded-xl border border-coral-300/60 bg-coral-100/50 px-3 py-2 text-sm font-semibold text-coral-800 backdrop-blur">{err}</p> : null}
      {!items ? <Loader2 className="mx-auto my-4 animate-spin text-ink-faint" /> : items.length === 0 ? <p className="py-4 text-center text-sm text-ink-faint">עוד לא הופקו קבצים</p> : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.id} className="rounded-2xl border border-primary-900/10 bg-[linear-gradient(135deg,rgba(242,242,246,0.72),rgba(242,242,246,0.6))] p-3 backdrop-blur-md">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink">{it.label}</p>
                  <p className="text-[11px] text-ink-faint">{KIND[it.kind] ?? it.kind} · {it.format.toUpperCase()} · הופק {fmt(it.created_at)} · נמחק בעוד {daysLeft(it.expires_at)} ימים</p>
                </div>
                {!shown[it.id] ? (
                  <button type="button" onClick={() => reveal(it)} disabled={busy === it.id} className={cn(opsGlassBtnClass, 'gap-2')} data-testid="legal-pw-reveal">
                    {busy === it.id ? <Loader2 size={16} className="animate-spin" /> : <ScanFace size={16} />}הצגת הסיסמה
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <span dir="rtl" className="rounded-xl border border-accent-300/60 bg-accent-50/40 px-3 py-1.5 text-[15px] font-bold text-primary-900 backdrop-blur select-all" data-testid="legal-pw-value">{shown[it.id]}</span>
                    <button type="button" onClick={() => copy(it)} className={cn(opsGlassBtnClass, 'gap-1.5')} aria-label="העתקת הסיסמה">{copied === it.id ? <Check size={16} className="text-primary-600" /> : <Copy size={16} />}{copied === it.id ? 'הועתק' : 'העתקה'}</button>
                    <button type="button" onClick={() => openDraft(it)} className={cn(opsGlassBtnClass, 'gap-1.5')}><Mail size={16} />שליחה למישהו</button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <StepUpDialog open={!!pending} purpose="legal.password" reason="הצגת סיסמה של תיק ראיות" onClose={() => setPending(null)} onVerified={() => void afterStepUp()} />
      {draft ? (
        <div className="fixed inset-0 z-50 grid place-items-end bg-primary-950/40 backdrop-blur-sm sm:place-items-center" role="dialog" aria-modal="true" aria-label="טיוטת שליחה">
          <div className="w-full max-w-lg rounded-t-[28px] border border-accent-200/40 bg-[linear-gradient(160deg,rgba(242,242,246,0.94),rgba(232,232,237,0.92))] p-5 shadow-2xl backdrop-blur-xl sm:rounded-[28px]">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold text-ink">טיוטה לשליחה</h3>
              <button type="button" onClick={() => setDraft(null)} aria-label="סגירה" className="rounded-full p-1.5 text-ink-soft hover:bg-glass/40"><X size={18} /></button>
            </div>
            <p className="mb-2 text-[12px] text-ink-soft">שום דבר לא נשלח אוטומטית. אפשר לערוך, ואז לפתוח את הטיוטה באפליקציית המייל שלך ולשלוח משם.</p>
            <label className="mb-2 block text-sm text-ink-soft">למי
              <input value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} dir="ltr" placeholder="lawyer@example.com" className="mt-1 w-full rounded-xl border border-primary-900/15 bg-primary-50/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent-300" />
            </label>
            <textarea value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} rows={8} className="w-full rounded-xl border border-primary-900/15 bg-primary-50/40 px-3 py-2 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-accent-300" />
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => { void navigator.clipboard.writeText(draft.text).catch(() => undefined); }} className={cn(opsGlassBtnClass, 'gap-1.5')}><Copy size={16} />העתקת הטיוטה</button>
              <a href={`mailto:${encodeURIComponent(draft.to)}?subject=${encodeURIComponent(`סיסמה לקובץ ${draft.item.file_name}`)}&body=${encodeURIComponent(draft.text)}`} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-gradient-to-l from-primary-700 to-primary-800 px-4 text-sm font-bold text-accent-50 shadow-lg">
                <Mail size={16} />פתיחה באפליקציית המייל
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
