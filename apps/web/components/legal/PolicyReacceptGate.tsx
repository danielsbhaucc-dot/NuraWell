'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileCheck2, Loader2 } from 'lucide-react';
import { AnimatedDialog } from '@/components/shared/AnimatedDialog';

/**
 * Blocking re-accept prompt after a material policy change (owner decision t1256s5353).
 * Cannot be dismissed: the app continues only after the updated privacy policy and terms are accepted.
 */
export function PolicyReacceptGate({ show, version }: { show: boolean; version: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(show);
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function accept() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/v1/legal/policy-accept', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version }),
      });
      if (res.status === 409) {
        setError('המדיניות עודכנה שוב. הדף ייטען מחדש עם הנוסח האחרון.');
        router.refresh();
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      setOpen(false);
      router.refresh();
    } catch {
      setError('השמירה לא הצליחה. כדאי לנסות שוב בעוד רגע.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatedDialog
      open={open}
      onClose={() => undefined}
      dismissOnBackdrop={false}
      zIndex={420}
      aria-labelledby="policy-reaccept-title"
      aria-describedby="policy-reaccept-desc"
      variant="center"
      mobileChromePadding
      backdropClassName="absolute inset-0 bg-ink-900/55"
      panelClassName="crystal-surface max-w-md rounded-2xl p-5 shadow-2xl"
    >
      <div data-testid="policy-reaccept" className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-100 text-primary-700" aria-hidden>
            <FileCheck2 className="size-5" />
          </span>
          <div>
            <h2 id="policy-reaccept-title" className="text-lg font-black text-ink">
              עדכנו את מדיניות הפרטיות
            </h2>
            <p id="policy-reaccept-desc" className="mt-1 text-sm leading-relaxed text-ink-soft">
              כדי להמשיך, צריך לאשר את הנוסח המעודכן. מה השתנה:
            </p>
          </div>
        </div>
        <ul className="list-disc space-y-2 ps-5 text-sm leading-relaxed text-ink-soft">
          <li>החשבון לכניסה מנוהל בחשבון המרכזי של חברת האם ומשמש לכל המוצרים שלה. הנתונים של <bdi className="font-semibold text-ink">NuraWell</bdi> נשמרים בנפרד.</li>
          <li>מחיקת הפרופיל מוחקת את כל נתוני <bdi className="font-semibold text-ink">NuraWell</bdi>. אם אין מוצרים נוספים, החשבון המרכזי נמחק אחרי 30 יום, ועד אז אפשר לבטל.</li>
          <li>אחרי מחיקה נשמרת רשומה משפטית מינימלית ומוצפנת ל־7 שנים, בלי תוכן בריאותי ובלי שימוש לשיווק.</li>
        </ul>
        <p className="text-sm text-ink-soft">
          הנוסח המלא:{' '}
          <Link href="/privacy" className="font-semibold text-primary-700 underline">מדיניות הפרטיות</Link>
          {' · '}
          <Link href="/terms" className="font-semibold text-primary-700 underline">תנאי השימוש</Link>
        </p>
        <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl border border-hairline p-3 text-sm text-ink">
          <input
            type="checkbox"
            className="mt-0.5 size-5 shrink-0 accent-primary-700"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
          <span>קראתי את מדיניות הפרטיות ואת תנאי השימוש המעודכנים, והם מקובלים עליי.</span>
        </label>
        {error ? <p role="alert" className="text-sm font-semibold text-coral-700">{error}</p> : null}
        <button
          type="button"
          onClick={() => void accept()}
          disabled={!checked || saving}
          className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-primary-700 px-4 font-bold text-on-dark disabled:opacity-50"
        >
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          אישור והמשך
        </button>
      </div>
    </AnimatedDialog>
  );
}
