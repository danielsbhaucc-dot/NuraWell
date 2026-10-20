'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2, Sparkles, X } from 'lucide-react';
import { opsGlassBtnClass } from '@/components/admin/OpsPanel';
import { cn } from '@/lib/cn';
import { ItemCard, type MediaItem } from '@/components/admin/AdminMediaEvidencePanel';
import { AssetThumb } from './AssetThumb';
import { kindHe, statusChip, type HubAsset } from './LegalHub';

/** One media asset = the central object: receipt match, details, evidence log, export. Details on demand. */
export function AssetSheet({ assetKey, hub, onClose, onChanged }: { assetKey: string; hub: HubAsset | null; onClose: () => void; onChanged: () => void }) {
  const [item, setItem] = useState<MediaItem | null>(null);
  const [busy, setBusy] = useState<'confirmed' | 'rejected' | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const load = () => fetch('/api/v1/ops/legal/media', { cache: 'no-store' }).then((r) => r.json()).then((d) => setItem((d.items as MediaItem[]).find((i) => i.key === assetKey) ?? null)).catch(() => undefined);
  useEffect(() => { void load(); }, [assetKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const decide = async (decision: 'confirmed' | 'rejected') => {
    if (!hub?.match) return; setBusy(decision);
    const r = await fetch('/api/v1/ops/legal/hub', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'link', asset_key: assetKey, receipt_id: hub.match.receipt_id, decision, confidence: hub.match.confidence }) }).catch(() => null);
    setBusy(null);
    if (r?.ok) { setDone(decision === 'confirmed' ? 'הקבלה שויכה לקובץ, נחתמה ונרשמה ביומן.' : 'סומן שזו לא הקבלה. אחפש התאמה אחרת.'); onChanged(); }
  };
  const st = hub ? statusChip(hub) : null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-emerald-950/35 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label="פרטי קובץ" dir="rtl" onClick={onClose} data-testid="asset-sheet">
      <div onClick={(e) => e.stopPropagation()} className="mt-auto max-h-[94dvh] w-full overflow-y-auto rounded-t-[30px] border border-amber-200/40 bg-[linear-gradient(165deg,rgba(214,238,230,0.97),rgba(232,226,206,0.95))] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl backdrop-blur-xl sm:mt-0 sm:h-full sm:max-h-none sm:max-w-xl sm:rounded-none sm:rounded-l-[30px] sm:p-6">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-emerald-900/15 sm:hidden" />
        <div className="flex items-start gap-4">
          {hub ? <AssetThumb thumb={hub.thumb} kind={hub.kind} size="lg" className="h-24 w-24 shrink-0 rounded-[22px] sm:h-28 sm:w-28" /> : <div className="h-24 w-24 shrink-0 animate-pulse rounded-[22px] bg-emerald-900/10" />}
          <div className="min-w-0 flex-1">
            <p className="text-[11.5px] font-bold text-amber-700">{hub ? `${kindHe(hub.kind)}${hub.created_on ? ` · ${hub.created_on.split('-').reverse().join('.')}` : ''}` : '…'}</p>
            <h2 className="mt-0.5 break-words font-[Rubik] text-xl font-bold leading-tight text-slate-900">{hub?.title || item?.title || assetKey.split('/').pop()}</h2>
            {st ? <span className={cn('mt-2 inline-flex rounded-full border px-2.5 py-0.5 text-[11.5px] font-bold', st.cls)}>{st.label}</span> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="סגירה" className="rounded-full p-1.5 text-slate-600 hover:bg-glass/50"><X size={20} /></button>
        </div>

        {hub?.match && hub.receipt !== 'confirmed' ? (
          <section className="mt-5 rounded-[22px] border border-amber-300/50 bg-amber-500/[0.07] p-4" data-testid="asset-match">
            <p className="flex items-center gap-1.5 text-[12px] font-bold text-amber-800"><Sparkles size={14} />{hub.receipt === 'auto' ? 'שויך לבד' : 'התאמה אוטומטית'}</p>
            <p className="mt-1 font-[Rubik] font-bold text-slate-900">{hub.match.vendor}{hub.match.plan ? ` · ${hub.match.plan}` : ''}</p>
            <p className="text-[12.5px] text-slate-600">{[hub.match.amount != null ? `${hub.match.amount} ${hub.match.currency ?? ''}` : null, hub.match.receipt_date ? `התקבלה ${hub.match.receipt_date.split('-').reverse().join('.')}` : null].filter(Boolean).join(' · ')}</p>
            <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-teal-900/10"><div className="h-full rounded-full bg-linear-to-l from-teal-500 to-emerald-700" style={{ width: `${hub.match.confidence}%` }} /></div>
            <p className="mt-1 text-[12px] text-slate-600">התאמה {hub.match.confidence}%: {hub.match.reasons.join(' · ')}</p>
            {done ? <p className="mt-3 flex items-center gap-1.5 text-sm font-bold text-emerald-800"><Check size={16} />{done}</p> : (
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => void decide('confirmed')} disabled={!!busy} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-linear-to-br from-amber-500 to-amber-700 px-4 text-sm font-bold text-amber-50 shadow-[0_6px_16px_rgba(180,83,9,0.28)]" data-testid="asset-match-confirm">{busy === 'confirmed' ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}נכון, לשייך</button>
                <button type="button" onClick={() => void decide('rejected')} disabled={!!busy} className={opsGlassBtnClass}>זו לא הקבלה</button>
              </div>
            )}
          </section>
        ) : hub?.receipt === 'missing' ? (
          <section className="mt-5 rounded-[22px] border border-rose-300/50 bg-rose-500/[0.06] p-4">
            <p className="font-[Rubik] font-bold text-rose-900">חסרה קבלה</p>
            <p className="mt-1 text-[13px] text-slate-700">מעבירים את מייל הקבלה ל־receipts@nurawell.ai, או מעלים אותה בלשונית ״קבלות ומנויים״. היא תשויך לקובץ לבד.</p>
          </section>
        ) : null}

        <div className="mt-5">
          <p className="mb-2 px-1 text-[12px] font-bold text-slate-500">פרטים, יומן ראיות והפקת תיק</p>
          {item ? <ul><ItemCard item={item} open onToggle={() => undefined} onChanged={() => { void load(); onChanged(); }} /></ul> : <div className="grid place-items-center p-8"><Loader2 className="animate-spin text-slate-400" /></div>}
        </div>
      </div>
    </div>
  );
}
