import { Sparkles } from 'lucide-react';

export function PublicAiPresence({ compact = false }: { compact?: boolean }) {
  return (
    <aside
      dir="rtl"
      className="mx-auto w-full max-w-md rounded-3xl border border-emerald-200/25 px-4 py-3 text-right text-white shadow-[0_18px_48px_rgba(2,44,34,0.25)] backdrop-blur-xl"
      style={{ background: 'linear-gradient(145deg, rgba(2,44,34,0.92), rgba(4,120,87,0.86))' }}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-emerald-400/25 text-emerald-100 ring-1 ring-white/25">
          <Sparkles className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-black">אלמוג מחכה בצד השני</p>
          <p className="mt-1 text-xs leading-relaxed text-white/78">
            {compact
              ? 'אחרי האימות נפתח ליווי AI אישי שמכיר את הקצב, ההרגלים והמסע שלך.'
              : 'הכניסה היא לא רק לאפליקציה. אלמוג מחבר כל מסך לשיחה, לזיכרון אישי ולצעד הבא שמתאים לך.'}
          </p>
        </div>
      </div>
    </aside>
  );
}
