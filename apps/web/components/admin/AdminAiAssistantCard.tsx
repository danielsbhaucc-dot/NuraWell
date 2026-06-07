'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, BrainCircuit, Sparkles, Wand2 } from 'lucide-react';

type AdminAiAssistantCardProps = {
  opsHref: (path: string) => string;
};

function resolveCopy(pathname: string) {
  if (pathname.includes('/users')) {
    return {
      title: 'AI Admin על המשתמשים',
      body: 'פתח משתמש כדי לראות זיכרון אלמוג, עלויות ודפוסי התקדמות. השלב הבא: סיכום התערבות אוטומטי לפי משתמש.',
      href: '/users',
      cta: 'למשתמשים',
      icon: BrainCircuit,
    };
  }
  if (pathname.includes('/costs')) {
    return {
      title: 'AI על עלויות ותפעול',
      body: 'הדוח מראה עלויות AI, וידאו והתראות. השתמש בו כדי לזהות חריגות ולכוון מודלים זולים למסכי background.',
      href: '/costs',
      cta: 'בדוק עלויות',
      icon: BarChart3,
    };
  }
  if (pathname.includes('/journey-hub')) {
    return {
      title: 'מצב סוכן למסעות',
      body: 'אפשר ליצור מסע שלם מ-prompt, ואז לפתוח כל צעד ל-AI-fill וליטוש תוכן.',
      href: '/journey-hub',
      cta: 'צור מסע ב-AI',
      icon: Wand2,
    };
  }
  if (pathname.includes('/journey') || pathname.includes('/steps')) {
    return {
      title: 'AI עורך תוכן מסע',
      body: 'לכל צעד יש מילוי חכם, שאלות חידוד, סריקת מחקרים וסנכרון לידע של אלמוג.',
      href: '/steps/new',
      cta: 'צעד חדש עם AI',
      icon: Wand2,
    };
  }
  if (pathname.includes('/system-rag-ingest')) {
    return {
      title: 'AI Knowledge Layer',
      body: 'זה המקום להזין ולסנכרן ידע שאלמוג יכול לשלוף בשיחות. כל תוכן כאן הופך לזיכרון מערכת.',
      href: '/system-rag-ingest',
      cta: 'ניהול ידע',
      icon: BrainCircuit,
    };
  }
  return {
    title: 'Ops AI-First',
    body: 'כל פעולה ניהולית צריכה להתחבר לאלמוג: יצירת מסעות, זיכרון משתמשים, RAG, עלויות ותובנות.',
    href: '/journey-hub',
    cta: 'התחל מיצירת מסע',
    icon: Sparkles,
  };
}

export function AdminAiAssistantCard({ opsHref }: AdminAiAssistantCardProps) {
  const pathname = usePathname();
  const copy = resolveCopy(pathname);
  const Icon = copy.icon;

  return (
    <section
      dir="rtl"
      className="relative overflow-hidden rounded-3xl border border-white/55 bg-white/35 px-4 py-3.5 shadow-[0_14px_40px_rgba(99,102,241,0.10)] backdrop-blur-2xl"
    >
      <div className="pointer-events-none absolute -left-10 -top-12 h-32 w-32 rounded-full bg-violet-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-8 -bottom-12 h-32 w-32 rounded-full bg-emerald-400/20 blur-3xl" />
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3 text-right">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-emerald-500 text-white shadow-lg">
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="font-display text-base font-black text-slate-950">{copy.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">{copy.body}</p>
          </div>
        </div>
        <Link
          href={opsHref(copy.href)}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-2xl border border-violet-300/45 bg-violet-500/15 px-4 py-2 text-sm font-black text-violet-950 transition hover:bg-violet-500/20"
        >
          <Sparkles className="h-4 w-4" />
          {copy.cta}
        </Link>
      </div>
    </section>
  );
}
