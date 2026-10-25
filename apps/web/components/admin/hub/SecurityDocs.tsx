'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { opsGlassCardClass } from '@/components/admin/OpsPanel';
import { cn } from '@/lib/cn';
import { sanitizeLessonHtml } from '@/lib/sanitize-lesson-html';

type Doc = { slug: string; title: string; html: string };

/** תיק אבטחה ופרטיות (docs/security) — קריאה בלבד. */
export function SecurityDocs() {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [err, setErr] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/v1/ops/legal/security-docs', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { docs: Doc[] }) => setDocs(d.docs))
      .catch(() => setErr(true));
  }, []);
  if (err) return <p role="alert" className="rounded-2xl border border-rose-300/60 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-800">לא הצלחנו לטעון את המסמכים.</p>;
  if (!docs) return <Loader2 className="mx-auto animate-spin text-ink-faint" />;
  return (
    <div className="space-y-2" data-testid="security-docs">
      {docs.map((d) => (
        <section key={d.slug} className={cn(opsGlassCardClass, 'overflow-hidden')}>
          <button type="button" onClick={() => setOpen(open === d.slug ? null : d.slug)} aria-expanded={open === d.slug}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-right text-[15px] font-bold text-ink">
            {d.title}
            <ChevronLeft size={16} className={cn('shrink-0 transition', open === d.slug && '-rotate-90')} />
          </button>
          {open === d.slug ? (
            <div dir="rtl" className="prose prose-sm max-w-none overflow-x-auto px-4 pb-4 [&_table]:text-xs [&_td]:border [&_td]:border-hairline [&_td]:px-2 [&_th]:border [&_th]:border-hairline [&_th]:px-2"
              dangerouslySetInnerHTML={{ __html: sanitizeLessonHtml(d.html) }} />
          ) : null}
        </section>
      ))}
    </div>
  );
}
