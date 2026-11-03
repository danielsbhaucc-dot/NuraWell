import { KeyRound, Mail, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/Button';

/** Hebrew, RTL, no native dialogs. Server component (no client JS). Shown only to identities the gate actually blocks. */
export default function LicenseRequired({ purchaseHref, signOut }: { purchaseHref: string; signOut: () => Promise<void> }) {
  return (
    <main id="main-content" dir="rtl" lang="he" className="min-h-screen flex flex-col items-center justify-center px-4 py-10 public-dark public-dark-bg">
      <div className="max-w-md w-full text-center">
        <div
          className="rounded-2xl overflow-hidden mb-6"
          style={{ border: '1px solid rgba(232,198,106,0.3)', boxShadow: 'inset 0 1px 0 rgba(207,233,220,0.08), 0 30px 60px -30px rgba(0,0,0,0.8)' }}
        >
          <div className="px-6 py-5 flex items-center justify-center gap-3" style={{ background: 'linear-gradient(145deg, var(--color-forest-800), var(--color-forest-600) 60%, var(--color-primary-600))' }}>
            <KeyRound className="w-7 h-7 text-on-dark shrink-0" aria-hidden="true" />
            <h1 className="text-2xl font-black text-on-dark">נדרש רישיון פעיל</h1>
          </div>
          <div className="p-6 bg-panel-dark border-t border-panel-dark-line">
            <p className="text-ink-soft text-lg leading-relaxed mb-3">
              לחשבון הזה אין כרגע רישיון פעיל, ולכן אין גישה לאפליקציה.
            </p>
            <p className="text-ink-faint text-base leading-relaxed">
              אפשר להסדיר רישיון בעמוד הרכישה. אם זו טעות — כדאי לפנות אלינו ונבדוק.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <a
            href={purchaseHref}
            rel="noopener"
            className="flex items-center justify-center gap-2 w-full min-h-12 py-4 rounded-2xl font-bold text-lg text-on-dark bg-linear-to-br from-primary-700 to-primary-500 shadow-btn transition-all hover:brightness-105 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <KeyRound className="w-5 h-5" aria-hidden="true" />
            <span>לעמוד הרכישה</span>
          </a>
          <div className="flex flex-wrap gap-3">
            <a
              href="/contact"
              className="flex-1 min-w-[8rem] min-h-12 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ background: 'var(--color-panel-dark)', border: '1px solid rgba(232,198,106,0.26)', color: 'var(--color-ink-soft)' }}
            >
              <Mail className="w-4 h-4" aria-hidden="true" />
              <span>יצירת קשר</span>
            </a>
            <form action={signOut} className="flex-1 min-w-[8rem] flex">
              <Button type="submit" variant="dark" size="lg" className="w-full text-base">
                <LogOut className="w-4 h-4" aria-hidden="true" />
                <span>התנתקות</span>
              </Button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
