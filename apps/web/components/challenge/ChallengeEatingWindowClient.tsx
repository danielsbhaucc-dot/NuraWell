'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Loader2 } from 'lucide-react';
import type { ChallengeEatingWindowLesson } from '@/lib/challenge/content';
import type { EatingWindowConfig } from '@/lib/challenge/types';

type Step = 'lesson' | 'confirm';

export function ChallengeEatingWindowClient() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('lesson');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<EatingWindowConfig | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [lesson, setLesson] = useState<ChallengeEatingWindowLesson | null>(null);

  useEffect(() => {
    fetch('/api/v1/challenge/eating-window', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        setConfig(d.saved ?? d.suggested);
        setSuggestions(d.suggestions ?? []);
        setLesson(d.lesson ?? null);
      })
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await fetch('/api/v1/challenge/eating-window', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eating_window: config }),
      });
      router.push('/challenge/interview');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !config) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#05010f]">
        <Loader2 className="h-10 w-10 animate-spin text-emerald-400" />
      </div>
    );
  }

  if (step === 'lesson' && lesson) {
    return (
      <div className="min-h-[100dvh] bg-[#05010f] px-4 py-8 text-white" dir="rtl">
        <div className="mx-auto max-w-lg">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400/80">
            שיעור קצר לפני ההגדרה
          </p>
          <h1 className="mt-2 font-display text-2xl font-black">{lesson.title}</h1>

          <div
            className="prose prose-invert prose-sm mt-6 max-w-none leading-relaxed text-white/80 prose-p:my-3 prose-strong:text-emerald-200"
            dangerouslySetInnerHTML={{ __html: lesson.body_html }}
          />

          {lesson.video_url ? (
            <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
              <iframe
                title={lesson.title}
                src={lesson.video_url}
                className="aspect-video w-full"
                allowFullScreen
              />
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setStep('confirm')}
            className="mt-8 w-full rounded-2xl bg-emerald-500 py-4 font-bold"
          >
            הבנתי — בואו נגדיר את החלון שלי
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#05010f] px-4 py-8 text-white" dir="rtl">
      <div className="mx-auto max-w-lg">
        {lesson ? (
          <button
            type="button"
            onClick={() => setStep('lesson')}
            className="mb-4 inline-flex items-center gap-1 text-sm text-white/50 hover:text-white/80"
          >
            <ChevronLeft className="h-4 w-4" />
            חזרה לשיעור
          </button>
        ) : null}

        <h1 className="font-display text-2xl font-black">חלון האכילה שלך</h1>
        <p className="mt-2 text-white/60">12:12 — מותאם אישית לפי השעות שהגדרת בהרשמה.</p>

        <div className="mt-8 space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex justify-between text-lg">
            <span className="text-white/50">פתיחה</span>
            <span className="font-bold tabular-nums">{config.start}</span>
          </div>
          <div className="flex justify-between text-lg">
            <span className="text-white/50">סגירה</span>
            <span className="font-bold tabular-nums">{config.end}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-white/40">ארוחה אחרונה מומלצת</span>
            <span className="tabular-nums text-emerald-300">{config.last_meal_recommended}</span>
          </div>
        </div>

        {suggestions.map((s) => (
          <p key={s} className="mt-4 rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {s}
          </p>
        ))}

        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="mt-8 w-full rounded-2xl bg-emerald-500 py-4 font-bold disabled:opacity-60"
        >
          {saving ? 'שומר...' : 'אישור — בואו נתחיל!'}
        </button>
      </div>
    </div>
  );
}
