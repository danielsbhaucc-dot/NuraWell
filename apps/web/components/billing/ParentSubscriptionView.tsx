import Link from 'next/link';
import { ChevronRight, CreditCard, ExternalLink, LifeBuoy } from 'lucide-react';
import { GlassCard } from '@/components/ui';
import { cn } from '@/components/ui/cn';
import type { SubscriptionState, SubscriptionTone, SubscriptionView } from '@/lib/central/my-subscription';

const COPY: Record<SubscriptionState, { label: string; title: string; body: string }> = {
  active: { label: 'פעיל', title: 'המנוי פעיל', body: 'הגישה לכל תחנות המסע ולאלמוג פתוחה.' },
  staff: { label: 'צוות', title: 'חשבון צוות', body: 'לחשבון הזה יש גישה מלאה בלי מנוי.' },
  none: { label: 'אין מנוי', title: 'אין כרגע מנוי פעיל', body: 'אפשר לרכוש מנוי בחשבון הראשי. הגישה נפתחת בכניסה הבאה.' },
  expired: { label: 'הסתיים', title: 'המנוי הסתיים', body: 'אפשר לחדש אותו בחשבון הראשי. הנתונים שלך נשמרים לפי הבחירה בהגדרות הפרטיות.' },
  suspended: { label: 'מושהה', title: 'המנוי מושהה', body: 'הפרטים וההסדרה נמצאים בחשבון הראשי. אפשר גם לכתוב לתמיכה.' },
  revoked: { label: 'בוטל', title: 'המנוי בוטל', body: 'לפרטים אפשר להיכנס לחשבון הראשי או לכתוב לתמיכה.' },
  unknown: { label: 'לא נבדק', title: 'לא הצלחנו לבדוק את המנוי כרגע', body: 'הגישה לא נחסמת בגלל תקלה אצלנו. אפשר לנסות שוב בעוד כמה דקות.' },
};

const TONE: Record<SubscriptionTone, string> = {
  ok: 'bg-primary-500/14 text-primary-800 ring-primary-600/20',
  warn: 'bg-accent-400/18 text-accent-800 ring-accent-600/25',
  bad: 'bg-coral-400/15 text-coral-800 ring-coral-600/25',
};

const ROW = 'flex min-h-12 w-full items-center gap-3 px-4 py-3 text-start text-sm font-bold text-ink transition-colors hover:bg-primary-500/5 focus-visible:outline-2 focus-visible:outline-primary-400';

export function ParentSubscriptionView({ view }: { view: SubscriptionView }) {
  const c = COPY[view.state];
  return (
    <div className="container-mobile space-y-4 py-6 pb-10 md:pt-16" dir="rtl">
      <Link href="/profile" className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-primary-800">
        <ChevronRight className="h-4 w-4" aria-hidden />
        חזרה לפרופיל
      </Link>
      <header className="space-y-1">
        <h1 className="text-2xl font-black text-ink">המנוי שלי</h1>
        <p className="text-sm leading-relaxed text-ink-soft">המנוי מנוהל בחשבון הראשי, האחד לכל המוצרים. שם רואים חיובים, מחדשים או מבטלים.</p>
      </header>

      <GlassCard className="overflow-hidden p-0" data-testid="my-subscription" data-state={view.state}>
        <div className="flex items-start gap-3 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-500/10 ring-1 ring-primary-500/20">
            <CreditCard className="h-5 w-5 text-primary-700" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-extrabold text-ink">{c.title}</h2>
              <span className={cn('inline-flex items-center rounded-full px-2.5 py-[3px] text-xs font-bold ring-1 ring-inset', TONE[view.tone])}>{c.label}</span>
            </div>
            <p className="text-sm leading-relaxed text-ink-soft">{c.body}</p>
          </div>
        </div>

        {view.buyUrl || view.manageUrl ? (
          <div className="divide-y divide-hairline/70 border-t border-hairline/70 bg-surface/60">
            {view.buyUrl ? (
              <a href={view.buyUrl} className={ROW} data-testid="my-subscription-buy">
                <span className="min-w-0 flex-1">{view.state === 'expired' ? 'חידוש המנוי' : 'רכישת מנוי'}</span>
                <ExternalLink className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
              </a>
            ) : null}
            {view.manageUrl ? (
              <a href={view.manageUrl} className={ROW} data-testid="my-subscription-manage">
                <span className="min-w-0 flex-1">
                  ניהול המנוי, חיובים וביטול
                  <span className="block text-xs font-normal text-ink-faint">ביטול אפשרי בכל עת מאותו מסך, בלי לפנות לנציג.</span>
                </span>
                <ExternalLink className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
              </a>
            ) : null}
          </div>
        ) : null}
      </GlassCard>

      <GlassCard className="flex items-start gap-3 p-4">
        <LifeBuoy className="mt-0.5 h-5 w-5 shrink-0 text-primary-700" aria-hidden />
        <div className="min-w-0 space-y-1 text-sm leading-relaxed text-ink-soft">
          <p>שאלה על חיוב או גישה? אפשר לכתוב לתמיכה:</p>
          <a href="mailto:support@nurawell.ai" className="block w-fit max-w-full font-bold text-primary-800 underline [overflow-wrap:anywhere]" dir="ltr">support@nurawell.ai</a>
          <p>או לעבור ל<Link href="/contact" className="font-bold text-primary-800 underline">עמוד יצירת הקשר</Link>.</p>
        </div>
      </GlassCard>
    </div>
  );
}
