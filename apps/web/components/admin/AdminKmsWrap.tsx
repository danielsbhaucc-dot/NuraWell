'use client';

import { useEffect, useState } from 'react';
import { Cloud, Loader2, ShieldCheck } from 'lucide-react';
import { opsGlassBtnClass, opsGlassCardClass } from '@/components/admin/OpsPanel';

type KeyRow = { name: string; wrapped: boolean; plain: boolean; match: boolean | null; source: string; usedPrimary?: boolean | null };
type Status = { mode: string; state: string; error: string | null; keys: KeyRow[] };

const MODE: Record<string, string> = { off: 'כבוי (המפתחות הרגילים בשימוש)', verify: 'בדיקה (משווה בלי לשנות)', enforce: 'פעיל (המפתחות נפתחים מהכספת)' };

/** Triggers the server-side wrap. No key material or ciphertext ever reaches the browser. */
export function AdminKmsWrap() {
  const [st, setSt] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/v1/admin/kms-wrap', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((d) => d && setSt(d.status)).catch(() => {});
  }, []);

  async function wrap() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/v1/admin/kms-wrap', { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setMsg(d.message ?? 'משהו השתבש.');
      else setMsg(d.message ?? 'העטיפה התחילה בשרת.');
    } finally { setBusy(false); }
  }

  return (
    <section dir="rtl" className={`${opsGlassCardClass} mt-6 space-y-3 p-5`}>
      <h3 className="flex items-center gap-2 text-base font-semibold"><Cloud className="h-5 w-5" aria-hidden /> כספת מפתחות בענן (Google, פרנקפורט)</h3>
      <p className="text-sm opacity-80">מצב: {st ? MODE[st.mode] ?? st.mode : '...'}{st?.error ? ` · שגיאה: ${st.error}` : ''}</p>
      {st?.keys?.length ? (
        <ul className="text-sm">
          {st.keys.map((k) => (
            <li key={k.name}>{k.name}: {k.wrapped ? 'עטוף' : 'לא עטוף'}{k.match === true ? ' · תואם ✓' : k.match === false ? ' · לא תואם ✗' : ''}{k.source === 'kms' ? ' · נפתח מהכספת' : ''}</li>
          ))}
        </ul>
      ) : null}
      <button type="button" className={opsGlassBtnClass} disabled={busy} onClick={wrap}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />} עטיפת המפתחות בכספת
      </button>
      {msg && <p role="status" className="text-sm">{msg}</p>}
    </section>
  );
}
