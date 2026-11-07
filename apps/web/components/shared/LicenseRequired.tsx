import { KeyRound, Mail, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/Button';

/** Hebrew, RTL, no native dialogs. Server component (no client JS). Shown only to identities the gate actually blocks. */
const CTA = 'flex items-center justify-center gap-2 w-full min-h-12 py-4 rounded-2xl font-bold text-lg text-forest-950 bg-linear-to-br from-accent-300 to-accent-500 shadow-btn ring-1 ring-accent-200/50 hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';
const QUIET = 'flex items-center justify-center gap-2 w-full min-h-12 py-3 rounded-2xl font-bold text-base text-on-dark bg-panel-dark ring-1 ring-accent-200/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';
const MISTAKE = 'אם נראה שזו טעות, אפשר לפנות אלינו ונבדוק.';
type Props = { purchaseHref: string | null; signOut: () => Promise<void> };

const Notice = ({ hint }: { hint: string }) => (
  <div
    className="rounded-2xl overflow-hidden mb-6"
    style={{ border: '1px solid rgba(232,198,106,0.3)', boxShadow: 'inset 0 1px 0 rgba(207,233,220,0.08), 0 30px 60px -30px rgba(0,0,0,0.8)' }}
  >
    <div className="px-6 py-5 flex items-center justify-center gap-3" style={{ background: 'linear-gradient(145deg, var(--color-forest-800), var(--color-forest-600) 60%, var(--color-primary-600))' }}>
      <KeyRound className="w-7 h-7 text-on-dark shrink-0" aria-hidden="true" />
      <h1 className="text-2xl font-black text-on-dark">נדרש רישיון פעיל</h1>
    </div>
    <div className="p-6 bg-panel-dark border-t border-panel-dark-line">
      <p className="text-ink-soft text-lg leading-relaxed mb-3">לחשבון הזה אין כרגע רישיון פעיל, ולכן אין גישה לאפליקציה.</p>
      <p className="text-ink-faint text-base leading-relaxed">{hint}</p>
    </div>
  </div>
);

const SignOutButton = ({ signOut }: Pick<Props, 'signOut'>) => (
  <form action={signOut} className="flex">
    <Button type="submit" variant="dark" size="lg" className="w-full text-base">
      <LogOut className="w-4 h-4" aria-hidden="true" />
      <span>התנתקות</span>
    </Button>
  </form>
);

const Actions = ({ purchaseHref, signOut }: Props) => (
  <div className="flex flex-col gap-3">
    {purchaseHref ? (
      <a href={purchaseHref} rel="noopener" className={CTA}>
        <KeyRound className="w-5 h-5" aria-hidden="true" />
        <span>לעמוד הרכישה</span>
      </a>
    ) : null}
    <a href="/contact" className={purchaseHref ? QUIET : CTA}>
      <Mail className="w-5 h-5" aria-hidden="true" />
      <span>יצירת קשר</span>
    </a>
    <SignOutButton signOut={signOut} />
  </div>
);

/**
 * purchaseHref is null until the parent site has a public NuraWell purchase page; then the button stays hidden
 * (no dead controls). Bottom padding (12rem) stays clear of the floating accessibility button (bottom 6.75rem + its height), at any text size.
 */
const LicenseRequired = ({ purchaseHref, signOut }: Props) => (
  <main id="main-content" dir="rtl" lang="he" className="min-h-screen flex flex-col items-center justify-center px-4 pt-10 pb-[calc(12rem+env(safe-area-inset-bottom,0px))] public-dark public-dark-bg lr-page">
    <div className="max-w-md w-full text-center">
      <Notice hint={purchaseHref ? `אפשר להסדיר רישיון בעמוד הרכישה. ${MISTAKE}` : MISTAKE} />
      <Actions purchaseHref={purchaseHref} signOut={signOut} />
    </div>
  </main>
);

export default LicenseRequired;
