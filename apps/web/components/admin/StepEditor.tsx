'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  Save, ArrowRight, Plus, Trash2, Video, HelpCircle,
  Gamepad2, Heart, FileText, BookOpen, ListChecks, Sparkles, Brain, ChevronDown
} from 'lucide-react';
import type {
  JourneyStep, QuizQuestion, GameItem, CommitmentData,
  Research, JourneyTask, JourneyHabit
} from '../../lib/types/journey';
import {
  formatSecondsAsClock,
  parseClockToSeconds,
  parseImmersiveAttentionStops,
  serializeImmersiveAttentionStops,
  type ImmersiveAttentionStop,
} from '../../lib/journey/immersiveAttentionStops';

interface StepEditorProps {
  step: JourneyStep | null;
}
type EditorSectionId = 'basic' | 'video' | 'quiz' | 'game' | 'commitment' | 'research' | 'tasks' | 'habits' | 'pdf';

type JourneyStationOption = { id: string; title: string; sort_order: number };

const emptyQuiz: QuizQuestion = { id: '', question: '', options: ['', '', '', ''], correct_index: 0, explanation: '' };
const emptyGame: GameItem = { id: '', statement: '', is_true: true, explanation: '' };
const emptyResearch: Research = { id: '', title: '', authors: '', year: '', journal: '', finding: '', url: null };
const emptyTask: JourneyTask = {
  id: '',
  title: '',
  description: null,
  emoji: '✅',
  schedule: 'one_time',
  times_per_day: 1,
  weekly_day: 0,
};
const emptyHabit: JourneyHabit = {
  id: '',
  title: '',
  description: null,
  emoji: '💪',
  frequency: 'daily',
  weekly_day: 0,
};
const emptyAttentionStop: ImmersiveAttentionStop = {
  id: '',
  time_seconds: 105,
  question: 'האם לדעתך זה אומר שהגוף שורף המבורגר שלם רק כי שתינו מים לפני הארוחה?',
  feedback: 'לא. שתיית מים לפני הארוחה יכולה לתרום לתחושת שובע ולעזור לצרוך מעט פחות קלוריות, אבל מדובר בדרך כלל בהבדל מתון של עשרות קלוריות - לא שריפה של ארוחה שלמה.',
  auto_resume_seconds: 10,
};

function genId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }

export function StepEditor({ step }: StepEditorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const journeyListPath = pathname.startsWith('/ops') ? '/ops/journey' : '/journey';
  const isNew = !step;
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<EditorSectionId>('basic');
  const [expandedResearch, setExpandedResearch] = useState<number | null>(0);
  const [expandedTask, setExpandedTask] = useState<number | null>(0);
  const [expandedHabit, setExpandedHabit] = useState<number | null>(0);
  const [expandedQuiz, setExpandedQuiz] = useState<number | null>(null);
  const [expandedGame, setExpandedGame] = useState<number | null>(null);

  // Basic fields
  const [title, setTitle] = useState(step?.title || '');
  const [description, setDescription] = useState(step?.description || '');
  const [stepNumber, setStepNumber] = useState(step?.step_number || 1);
  const [isPublished, setIsPublished] = useState(step?.is_published || false);
  const [durationMinutes, setDurationMinutes] = useState(step?.duration_minutes || 8);
  const [summaryText, setSummaryText] = useState(step?.summary_text || '');
  const [stations, setStations] = useState<JourneyStationOption[]>([]);
  const [stationId, setStationId] = useState<string>(step?.station_id ?? '');

  useEffect(() => {
    if (!step) {
      setImmersiveAttentionStops([]);
      return;
    }
    setImmersiveAttentionStops(parseImmersiveAttentionStops(step.text_content));
  }, [step?.id, step?.text_content]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/admin/journey-stations', { credentials: 'include' });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as unknown;
        if (!Array.isArray(data) || cancelled) return;
        const list = data as JourneyStationOption[];
        setStations(
          [...list].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.title.localeCompare(b.title, 'he'))
        );
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Video
  const [videoProvider, setVideoProvider] = useState<string>(step?.video_provider || 'heygen');
  const [videoExternalId, setVideoExternalId] = useState(step?.video_external_id || '');
  const [videoExternalUrl, setVideoExternalUrl] = useState(step?.video_external_url || '');
  const [videoTitle, setVideoTitle] = useState(step?.video_title || '');
  const [immersiveAttentionStops, setImmersiveAttentionStops] = useState<ImmersiveAttentionStop[]>(
    parseImmersiveAttentionStops(step?.text_content)
  );

  // Structured data
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>(step?.quiz_questions || []);
  const [gameItems, setGameItems] = useState<GameItem[]>(step?.game_items || []);
  const [commitment, setCommitment] = useState<CommitmentData | null>(step?.commitment || null);
  const [researches, setResearches] = useState<Research[]>(step?.researches || []);
  const [tasks, setTasks] = useState<JourneyTask[]>(step?.tasks || []);
  const [habits, setHabits] = useState<JourneyHabit[]>(step?.habits || []);

  // PDF
  const [pdfUrl, setPdfUrl] = useState(step?.pdf_url || '');
  const [pdfName, setPdfName] = useState(step?.pdf_name || '');

  const handleSave = async () => {
    if (!title.trim()) { alert('חובה להזין כותרת'); return; }
    setSaving(true);

    const body: Record<string, unknown> = {
      title,
      description: description || null,
      step_number: stepNumber,
      station_id: stationId.trim() ? stationId.trim() : null,
      is_published: isPublished,
      duration_minutes: durationMinutes,
      summary_text: summaryText || null,
      video_provider: videoProvider || null,
      video_external_id: videoProvider === 'custom' ? null : (videoExternalId.trim() || null),
      video_external_url:
        videoProvider === 'custom' || videoProvider === 'bunny'
          ? (videoExternalUrl.trim() || null)
          : null,
      video_title: videoTitle || null,
      text_content: serializeImmersiveAttentionStops(immersiveAttentionStops, step?.text_content ?? null),
      quiz_questions: quizQuestions, game_items: gameItems,
      commitment, researches, tasks, habits,
      pdf_url: pdfUrl || null, pdf_name: pdfName || null,
    };

    if (!isNew) body.id = step!.id;

    const res = await fetch('/api/v1/admin/journey-steps', {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      router.push(journeyListPath);
      router.refresh();
    } else {
      const err = await res.json();
      alert('שגיאה: ' + (err.error || 'Unknown'));
    }
    setSaving(false);
  };

  const sectionOrder: EditorSectionId[] = ['basic', 'video', 'quiz', 'game', 'commitment', 'research', 'tasks', 'habits', 'pdf'];
  const activeSectionIndex = sectionOrder.indexOf(activeSection);
  const canGoBack = activeSectionIndex > 0;
  const canGoNext = activeSectionIndex < sectionOrder.length - 1;

  const goPrevSection = () => {
    if (!canGoBack) return;
    setActiveSection(sectionOrder[activeSectionIndex - 1]);
  };

  const goNextSection = () => {
    if (!canGoNext) return;
    setActiveSection(sectionOrder[activeSectionIndex + 1]);
  };

  return (
    <div className="max-w-3xl mx-auto pb-24 relative">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 rounded-[32px]"
        style={{
          background: 'linear-gradient(145deg, rgba(16,185,129,0.14), rgba(59,130,246,0.12), rgba(168,85,247,0.10))',
          filter: 'blur(0px)',
        }}
      />
      {/* Header */}
      <div
        className="flex items-center gap-3 mb-5 rounded-2xl px-3 py-3 backdrop-blur-md"
        style={{ background: 'rgba(255,255,255,0.62)', border: '1px solid rgba(255,255,255,0.65)', boxShadow: '0 10px 24px rgba(16,24,40,0.08)' }}
      >
        <button onClick={() => router.push(journeyListPath)}
          className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors shadow-sm"
          style={{ background: 'linear-gradient(135deg, #0f766e, #10b981)', border: '1px solid rgba(255,255,255,0.55)' }}>
          <ArrowRight className="w-5 h-5 text-white" />
        </button>
        <h1 className="text-xl font-black flex-1" style={{ color: '#1A1730' }}>
          {isNew ? 'צעד חדש' : `עריכת: ${step!.title}`}
        </h1>
        <button onClick={handleSave} disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white transition-all hover:scale-105 disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #047857, #10b981)' }}>
          <Save className="w-4 h-4" />
          {saving ? 'שומר...' : 'שמור'}
        </button>
      </div>

      <div className="space-y-5">
        {/* ═══ SECTION NAVIGATION ═══ */}
        <div
          className="rounded-2xl p-4 space-y-3 backdrop-blur-md"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.75), rgba(241,245,249,0.75))',
            border: '1px solid rgba(255,255,255,0.9)',
            boxShadow: '0 14px 32px rgba(15,23,42,0.12)',
          }}
        >
          <div className="flex items-center justify-between">
            <h2
              className="text-sm font-black px-3 py-1.5 rounded-lg"
              style={{ color: '#1A1730', background: 'linear-gradient(135deg, rgba(16,185,129,0.18), rgba(59,130,246,0.18))' }}
            >
              מבנה הצעד
            </h2>
            <span className="text-xs text-gray-600">לחיצה על שלב פותחת את הטופס שלו</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <SectionTab
              number={1}
              label="פרטים בסיסיים"
              color="#047857"
              active={activeSection === 'basic'}
              onClick={() => setActiveSection('basic')}
            />
            <SectionTab
              number={2}
              label="וידאו"
              detail={`${immersiveAttentionStops.length} נקודות קשב`}
              color="#2563eb"
              active={activeSection === 'video'}
              onClick={() => setActiveSection('video')}
            />
            <SectionTab
              number={3}
              label="שאלות הבנה"
              color="#059669"
              active={activeSection === 'quiz'}
              onClick={() => setActiveSection('quiz')}
            />
            <SectionTab
              number={4}
              label="משחק"
              color="#d97706"
              active={activeSection === 'game'}
              onClick={() => setActiveSection('game')}
            />
            <SectionTab
              number={5}
              label="התחייבות"
              color="#db2777"
              active={activeSection === 'commitment'}
              onClick={() => setActiveSection('commitment')}
            />
            <SectionTab
              number={6}
              label="מחקרים"
              color="#7c3aed"
              active={activeSection === 'research'}
              onClick={() => setActiveSection('research')}
            />
            <SectionTab
              number={7}
              label="משימות"
              color="#ea580c"
              active={activeSection === 'tasks'}
              onClick={() => setActiveSection('tasks')}
            />
            <SectionTab
              number={8}
              label="הרגלים"
              color="#10b981"
              active={activeSection === 'habits'}
              onClick={() => setActiveSection('habits')}
            />
            <SectionTab
              number={9}
              label="PDF"
              color="#ef4444"
              active={activeSection === 'pdf'}
              onClick={() => setActiveSection('pdf')}
            />
          </div>
        </div>

        {/* ═══ BASIC INFO ═══ */}
        <Section title="פרטים בסיסיים" icon={BookOpen} color="#047857" sectionNumber={1} isVisible={activeSection === 'basic'}>
          <Field label="כותרת הצעד">
            <input value={title} onChange={e => setTitle(e.target.value)}
              className="input-field" placeholder='למשל: 2 כוסות מים לפני כל ארוחה 💧' />
          </Field>
          <Field label="תיאור קצר">
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              className="input-field min-h-[60px]" placeholder="תיאור קצר שיופיע ברשימת הצעדים" />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="מספר צעד">
              <input type="number" value={stepNumber} onChange={e => setStepNumber(Number(e.target.value))}
                className="input-field" min={1} />
            </Field>
            <Field label="דקות">
              <input type="number" value={durationMinutes} onChange={e => setDurationMinutes(Number(e.target.value))}
                className="input-field" min={1} />
            </Field>
            <Field label="סטטוס">
              <button onClick={() => setIsPublished(!isPublished)}
                className={`w-full py-2.5 rounded-xl font-bold text-sm transition-all ${isPublished ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                {isPublished ? '✓ פורסם' : 'טיוטה'}
              </button>
            </Field>
          </div>
          <Field label="תחנה במסע (אופציונלי)">
            <select
              value={stationId}
              onChange={(e) => setStationId(e.target.value)}
              className="input-field"
            >
              <option value="">ללא תחנה</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} (סדר {s.sort_order})
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-gray-500 leading-relaxed">
              תחנה מקבצת צעדים לוגית (ללא הגבלת כמות). ניתן לנהל תחנות במסך &quot;מסע ותחנות&quot;.
            </p>
          </Field>
          <Field label="טקסט סיכום">
            <textarea value={summaryText} onChange={e => setSummaryText(e.target.value)}
              className="input-field min-h-[100px]" placeholder="סיכום מפורט של תוכן השיעור..." />
          </Field>
        </Section>

        {/* ═══ VIDEO ═══ */}
        <Section title="וידאו" icon={Video} color="#3b82f6" sectionNumber={2} isVisible={activeSection === 'video'}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="ספק וידאו">
              <select value={videoProvider} onChange={e => setVideoProvider(e.target.value)}
                className="input-field">
                <option value="heygen">HeyGen</option>
                <option value="youtube">YouTube</option>
                <option value="vimeo">Vimeo</option>
                <option value="bunny">Bunny</option>
                <option value="custom">Custom URL</option>
              </select>
            </Field>
            {videoProvider === 'custom' ? (
              <Field label="כתובת URL">
                <input value={videoExternalUrl} onChange={e => setVideoExternalUrl(e.target.value)}
                  className="input-field" placeholder="https://..." dir="ltr" />
              </Field>
            ) : (
              <Field label="מזהה / ID">
                <input value={videoExternalId} onChange={e => setVideoExternalId(e.target.value)}
                  className="input-field" placeholder={videoProvider === 'bunny' ? 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' : 'video ID'} dir="ltr" />
              </Field>
            )}
          </div>
          {videoProvider === 'bunny' && (
            <Field label="כתובת HLS (Pull Zone — video.nurawell.ai)">
              <input value={videoExternalUrl} onChange={e => setVideoExternalUrl(e.target.value)}
                className="input-field" placeholder="https://video.nurawell.ai/{מזהה-וידאו}/playlist.m3u8" dir="ltr" />
              <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                זה הדומיין המחובר ל־Bunny Stream אצלכם. אפשר להדביק את ה־URL המלא, או רק את הנתיב (למשל{' '}
                <span dir="ltr" className="font-mono text-[11px]">/uuid/playlist.m3u8</span>
                ). אפשר גם להזין <strong>רק UUID</strong> של הסרטון בשדה &quot;מזהה&quot; למעלה — יבנה אוטומטית ל־playlist ב־video.nurawell.ai.
                אם ב־Bunny מופעל <strong>Block direct URL file access</strong>, הוסיפו בפריסה (למשל Vercel) את{' '}
                <span dir="ltr" className="font-mono text-[11px]">NEXT_PUBLIC_BUNNY_STREAM_LIBRARY_ID</span>
                {' '}— מספר הספרייה מ־Stream (כמו ב־embed URL) — והאתר יעבור אוטומטית לנגן ה־embed במקום טעינת m3u8 ישירה.
              </p>
            </Field>
          )}
          <Field label="כותרת הסרטון">
            <input value={videoTitle} onChange={e => setVideoTitle(e.target.value)}
              className="input-field" placeholder="כותרת שתופיע מעל הסרטון" />
          </Field>

          <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)' }}>
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-black text-blue-800">
                נקודות קשב במסך מלא ({immersiveAttentionStops.length})
              </h3>
            </div>
            <p className="text-xs text-blue-900/80 leading-relaxed">
              יופיע רק בנגן מסך מלא: הסרטון יעצור בזמן שתבחרו, תוצג שאלה קצרה, ואז משוב והמשך אוטומטי או ידני.
            </p>
            {immersiveAttentionStops.map((stop, si) => (
              <div key={stop.id || si} className="p-3 rounded-xl bg-white border border-blue-100 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-700">נקודה {si + 1}</span>
                  <button
                    onClick={() => setImmersiveAttentionStops(prev => prev.filter((_, i) => i !== si))}
                    className="text-red-400 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Field label="זמן עצירה (MM:SS)">
                    <input
                      value={formatSecondsAsClock(stop.time_seconds)}
                      onChange={e => {
                        const arr = [...immersiveAttentionStops];
                        arr[si] = { ...arr[si], time_seconds: parseClockToSeconds(e.target.value) };
                        setImmersiveAttentionStops(arr);
                      }}
                      className="input-field"
                      dir="ltr"
                      placeholder="01:45"
                    />
                  </Field>
                  <Field label="המשך אוטומטי אחרי (שניות)">
                    <input
                      type="number"
                      min={3}
                      value={stop.auto_resume_seconds}
                      onChange={e => {
                        const arr = [...immersiveAttentionStops];
                        arr[si] = { ...arr[si], auto_resume_seconds: Number(e.target.value) || 10 };
                        setImmersiveAttentionStops(arr);
                      }}
                      className="input-field"
                    />
                  </Field>
                </div>
                <Field label="שאלה (מוצגת עם כן / לא)">
                  <input
                    value={stop.question}
                    onChange={e => {
                      const arr = [...immersiveAttentionStops];
                      arr[si] = { ...arr[si], question: e.target.value };
                      setImmersiveAttentionStops(arr);
                    }}
                    className="input-field"
                  />
                </Field>
                <Field label="משוב מקצועי אחרי בחירה">
                  <textarea
                    value={stop.feedback}
                    onChange={e => {
                      const arr = [...immersiveAttentionStops];
                      arr[si] = { ...arr[si], feedback: e.target.value };
                      setImmersiveAttentionStops(arr);
                    }}
                    className="input-field min-h-[80px]"
                  />
                </Field>
              </div>
            ))}
            <AddButton
              label="הוסף נקודת קשב"
              onClick={() => setImmersiveAttentionStops(prev => [...prev, { ...emptyAttentionStop, id: genId() }])}
            />
          </div>
        </Section>

        {/* ═══ QUIZ ═══ */}
        <Section title={`שאלות הבנה (${quizQuestions.length})`} icon={HelpCircle} color="#10b981" sectionNumber={3} isVisible={activeSection === 'quiz'}>
          {quizQuestions.map((q, qi) => (
            <div key={q.id || qi} className="rounded-xl border border-emerald-100 overflow-hidden" style={{ background: 'rgba(255,255,255,0.85)' }}>
              <button
                type="button"
                onClick={() => setExpandedQuiz(expandedQuiz === qi ? null : qi)}
                className="w-full p-3 flex items-center justify-between gap-2 text-right transition-colors hover:bg-emerald-50/80"
              >
                <span className="text-sm font-bold text-gray-800 min-w-0 flex-1 truncate">
                  שאלה {qi + 1}
                  {q.question.trim() ? ` — ${q.question.trim().slice(0, 72)}${q.question.trim().length > 72 ? '…' : ''}` : ''}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setQuizQuestions(prev => prev.filter((_, i) => i !== qi));
                      setExpandedQuiz((ex) => (ex === qi ? null : ex));
                    }}
                    className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50"
                    aria-label="מחק שאלה"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <ChevronDown className={`w-4 h-4 text-emerald-700 transition-transform ${expandedQuiz === qi ? 'rotate-180' : ''}`} />
                </div>
              </button>
              {expandedQuiz === qi && (
                <div className="p-4 pt-0 space-y-3 border-t border-emerald-100/80 bg-white/90">
                  <input value={q.question} onChange={e => {
                    const arr = [...quizQuestions]; arr[qi] = { ...arr[qi], question: e.target.value }; setQuizQuestions(arr);
                  }} className="input-field" placeholder="טקסט השאלה" />
                  {q.options.map((opt, oi) => (
                    <div key={oi} className="flex items-center gap-2">
                      <button type="button" onClick={() => {
                        const arr = [...quizQuestions]; arr[qi] = { ...arr[qi], correct_index: oi }; setQuizQuestions(arr);
                      }} className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${q.correct_index === oi ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                        {String.fromCharCode(1488 + oi)}
                      </button>
                      <input value={opt} onChange={e => {
                        const arr = [...quizQuestions]; const opts = [...arr[qi].options]; opts[oi] = e.target.value; arr[qi] = { ...arr[qi], options: opts }; setQuizQuestions(arr);
                      }} className="input-field flex-1" placeholder={`תשובה ${oi + 1}`} />
                    </div>
                  ))}
                  <input value={q.explanation} onChange={e => {
                    const arr = [...quizQuestions]; arr[qi] = { ...arr[qi], explanation: e.target.value }; setQuizQuestions(arr);
                  }} className="input-field" placeholder="הסבר לתשובה הנכונה" />
                </div>
              )}
            </div>
          ))}
          <AddButton label="הוסף שאלה" onClick={() => {
            const next = quizQuestions.length;
            setQuizQuestions(prev => [...prev, { ...emptyQuiz, id: genId() }]);
            setExpandedQuiz(next);
          }} />
        </Section>

        {/* ═══ GAME ═══ */}
        <Section title={`משחק נכון/לא נכון (${gameItems.length})`} icon={Gamepad2} color="#f59e0b" sectionNumber={4} isVisible={activeSection === 'game'}>
          {gameItems.map((g, gi) => (
            <div key={g.id || gi} className="rounded-xl border border-amber-100 overflow-hidden" style={{ background: 'rgba(255,255,255,0.88)' }}>
              <button
                type="button"
                onClick={() => setExpandedGame(expandedGame === gi ? null : gi)}
                className="w-full p-3 flex items-center justify-between gap-2 text-right transition-colors hover:bg-amber-50/90"
              >
                <span className="text-sm font-bold text-gray-800 min-w-0 flex-1 truncate">
                  טענה {gi + 1}
                  {g.statement.trim() ? ` — ${g.statement.trim().slice(0, 72)}${g.statement.trim().length > 72 ? '…' : ''}` : ''}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setGameItems(prev => prev.filter((_, i) => i !== gi));
                      setExpandedGame((ex) => (ex === gi ? null : ex));
                    }}
                    className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50"
                    aria-label="מחק טענה"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <ChevronDown className={`w-4 h-4 text-amber-700 transition-transform ${expandedGame === gi ? 'rotate-180' : ''}`} />
                </div>
              </button>
              {expandedGame === gi && (
                <div className="p-4 pt-0 space-y-3 border-t border-amber-100/90 bg-white/90">
                  <input value={g.statement} onChange={e => {
                    const arr = [...gameItems]; arr[gi] = { ...arr[gi], statement: e.target.value }; setGameItems(arr);
                  }} className="input-field" placeholder="טקסט הטענה" />
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => { const arr = [...gameItems]; arr[gi] = { ...arr[gi], is_true: true }; setGameItems(arr); }}
                      className={`px-4 py-2 rounded-lg font-bold text-sm ${g.is_true ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                      ✓ נכון
                    </button>
                    <button type="button" onClick={() => { const arr = [...gameItems]; arr[gi] = { ...arr[gi], is_true: false }; setGameItems(arr); }}
                      className={`px-4 py-2 rounded-lg font-bold text-sm ${!g.is_true ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
                      ✗ לא נכון
                    </button>
                  </div>
                  <input value={g.explanation} onChange={e => {
                    const arr = [...gameItems]; arr[gi] = { ...arr[gi], explanation: e.target.value }; setGameItems(arr);
                  }} className="input-field" placeholder="הסבר" />
                </div>
              )}
            </div>
          ))}
          <AddButton label="הוסף טענה" onClick={() => {
            const next = gameItems.length;
            setGameItems(prev => [...prev, { ...emptyGame, id: genId() }]);
            setExpandedGame(next);
          }} />
        </Section>

        {/* ═══ COMMITMENT ═══ */}
        <Section title="התחייבות" icon={Heart} color="#ec4899" sectionNumber={5} isVisible={activeSection === 'commitment'}>
          {commitment ? (
            <div className="p-4 rounded-xl bg-gray-50 border border-gray-100 space-y-3">
              <Field label="טקסט ההתחייבות">
                <input value={commitment.text} onChange={e => setCommitment({ ...commitment, text: e.target.value })}
                  className="input-field" />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <Field label="אימוג'י">
                  <input value={commitment.emoji} onChange={e => setCommitment({ ...commitment, emoji: e.target.value })}
                    className="input-field text-center text-2xl" />
                </Field>
                <div className="sm:col-span-3">
                  <Field label="תיאור">
                    <input value={commitment.description} onChange={e => setCommitment({ ...commitment, description: e.target.value })}
                      className="input-field" />
                  </Field>
                </div>
              </div>
              <button onClick={() => setCommitment(null)} className="text-sm text-red-500 hover:text-red-700">
                הסר התחייבות
              </button>
            </div>
          ) : (
            <AddButton label="הוסף התחייבות" onClick={() => setCommitment({ text: '', emoji: '💪', description: '' })} />
          )}
        </Section>

        {/* ═══ RESEARCHES ═══ */}
        <Section title={`מחקרים (${researches.length})`} icon={FileText} color="#8b5cf6" sectionNumber={6} isVisible={activeSection === 'research'}>
          {researches.map((r, ri) => (
            <div key={r.id || ri} className="rounded-xl border overflow-hidden" style={{ borderColor: 'rgba(139,92,246,0.18)', background: 'rgba(255,255,255,0.72)' }}>
              <button
                type="button"
                onClick={() => setExpandedResearch(expandedResearch === ri ? null : ri)}
                className="w-full p-3 flex items-center justify-between text-right"
                style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.12), rgba(99,102,241,0.08))' }}
              >
                <span className="text-sm font-bold text-violet-900">מחקר {ri + 1}</span>
                <ChevronDown className={`w-4 h-4 text-violet-700 transition-transform ${expandedResearch === ri ? 'rotate-180' : ''}`} />
              </button>
              {expandedResearch === ri && (
                <div className="p-3 space-y-3">
                  <input value={r.title} onChange={e => { const arr = [...researches]; arr[ri] = { ...arr[ri], title: e.target.value }; setResearches(arr); }}
                    className="input-field" placeholder="שם המחקר (אנגלית)" dir="ltr" />
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input value={r.authors} onChange={e => { const arr = [...researches]; arr[ri] = { ...arr[ri], authors: e.target.value }; setResearches(arr); }}
                      className="input-field" placeholder="חוקרים" dir="ltr" />
                    <input value={r.year} onChange={e => { const arr = [...researches]; arr[ri] = { ...arr[ri], year: e.target.value }; setResearches(arr); }}
                      className="input-field" placeholder="שנה" dir="ltr" />
                    <input value={r.journal} onChange={e => { const arr = [...researches]; arr[ri] = { ...arr[ri], journal: e.target.value }; setResearches(arr); }}
                      className="input-field" placeholder="כתב עת" dir="ltr" />
                  </div>
                  <textarea value={r.finding} onChange={e => { const arr = [...researches]; arr[ri] = { ...arr[ri], finding: e.target.value }; setResearches(arr); }}
                    className="input-field min-h-[60px]" placeholder="ממצא עיקרי (בעברית)" />
                  <input value={r.url || ''} onChange={e => { const arr = [...researches]; arr[ri] = { ...arr[ri], url: e.target.value || null }; setResearches(arr); }}
                    className="input-field" placeholder="קישור (אופציונלי)" dir="ltr" />
                  <button onClick={() => setResearches(prev => prev.filter((_, i) => i !== ri))}
                    className="text-red-500 hover:text-red-700 text-sm font-semibold">מחק מחקר</button>
                </div>
              )}
            </div>
          ))}
          <AddButton label="הוסף מחקר" onClick={() => setResearches(prev => [...prev, { ...emptyResearch, id: genId() }])} />
        </Section>

        {/* ═══ TASKS ═══ */}
        <Section title={`משימות (${tasks.length})`} icon={ListChecks} color="#f97316" sectionNumber={7} isVisible={activeSection === 'tasks'}>
          <div className="rounded-xl p-3 text-xs leading-relaxed" style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.18)', color: '#9a3412' }}>
            כל משימה צריכה להיות פעולה ברורה. בנוסף ל-&quot;מקובל/לא מקובל&quot; בסיכום, אפשר לבחור תזמון:
            <br />
            <strong>חד-פעמי</strong> = אישור פעם אחת · <strong>יומי</strong> = checkbox חדש כל יום · <strong>כמה פעמים ביום</strong> = סלוטים (בוקר/צהריים/ערב) ·
            {' '}<strong>שבועי</strong> = פעם בשבוע · <strong>לפני/אחרי ארוחה</strong> = מתואם לארוחות בפרופיל המשתמש (לרבות &quot;כל הארוחות&quot; הדינמי).
            <br />
            דוגמה: &quot;לשתות 2 כוסות מים לפני כל ארוחה&quot; → לפני כל ארוחה · 3 פעמים · לפני האוכל.
          </div>
          {tasks.map((t, ti) => {
            const schedule = t.schedule ?? 'one_time';
            const tpdRaw = typeof t.times_per_day === 'number' ? t.times_per_day : null;
            const tpdEffective =
              schedule === 'multi_daily' || schedule === 'per_meal'
                ? tpdRaw && tpdRaw >= 1 && tpdRaw <= 6
                  ? tpdRaw
                  : 3
                : 1;
            const wd =
              typeof t.weekly_day === 'number' && t.weekly_day >= 0 && t.weekly_day <= 6
                ? t.weekly_day
                : 0;
            const mealTiming: 'before' | 'after' = t.meal_timing === 'after' ? 'after' : 'before';
            const mealTarget: 'fixed' | 'all' = t.meal_target === 'all' ? 'all' : 'fixed';
            return (
            <div key={t.id || ti} className="rounded-xl border overflow-hidden" style={{ borderColor: 'rgba(249,115,22,0.2)', background: 'rgba(255,255,255,0.75)' }}>
              <button
                type="button"
                onClick={() => setExpandedTask(expandedTask === ti ? null : ti)}
                className="w-full p-3 flex items-center justify-between text-right"
                style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.15), rgba(251,146,60,0.10))' }}
              >
                <span className="text-sm font-bold text-orange-900">משימה {ti + 1}: {t.title || 'ללא כותרת'}</span>
                <ChevronDown className={`w-4 h-4 text-orange-700 transition-transform ${expandedTask === ti ? 'rotate-180' : ''}`} />
              </button>
              {expandedTask === ti && (
                <div className="p-3 space-y-2">
                  <Field label="אימוג'י">
                    <input value={t.emoji} onChange={e => { const arr = [...tasks]; arr[ti] = { ...arr[ti], emoji: e.target.value }; setTasks(arr); }}
                      className="w-16 input-field text-center text-xl" placeholder="✅" />
                  </Field>
                  <Field label="כותרת המשימה (חובה)">
                    <input value={t.title} onChange={e => { const arr = [...tasks]; arr[ti] = { ...arr[ti], title: e.target.value }; setTasks(arr); }}
                      className="input-field" placeholder="מה המשתמש אמור לבצע בפועל?" />
                  </Field>
                  <Field label="פירוט קצר (אופציונלי)">
                    <input value={t.description || ''} onChange={e => { const arr = [...tasks]; arr[ti] = { ...arr[ti], description: e.target.value || null }; setTasks(arr); }}
                      className="input-field" placeholder="לדוגמה: היום עד 20:00, 10 דקות הליכה" />
                  </Field>

                  <Field label="תזמון">
                    <select
                      value={schedule}
                      onChange={(e) => {
                        const next = e.target.value as JourneyTask['schedule'];
                        const arr = [...tasks];
                        const nextTpd =
                          next === 'multi_daily' || next === 'per_meal'
                            ? tpdRaw && tpdRaw >= 1 && tpdRaw <= 6
                              ? tpdRaw
                              : 3
                            : 1;
                        arr[ti] = { ...arr[ti], schedule: next, times_per_day: nextTpd };
                        setTasks(arr);
                      }}
                      className="input-field"
                    >
                      <option value="one_time">חד-פעמי (אישור פעם אחת)</option>
                      <option value="daily">יומי (איפוס בכל בוקר)</option>
                      <option value="multi_daily">כמה פעמים ביום</option>
                      <option value="weekly">שבועי (יום קבוע)</option>
                      <option value="per_meal">לפני כל ארוחה</option>
                    </select>
                  </Field>

                  {schedule === 'per_meal' ? (
                    <>
                      <Field label="לפני או אחרי הארוחה">
                        <select
                          value={mealTiming}
                          onChange={(e) => {
                            const arr = [...tasks];
                            arr[ti] = {
                              ...arr[ti],
                              meal_timing: e.target.value as 'before' | 'after',
                            };
                            setTasks(arr);
                          }}
                          className="input-field"
                        >
                          <option value="before">לפני הארוחה</option>
                          <option value="after">אחרי הארוחה</option>
                        </select>
                      </Field>
                      <Field label="לכמה ארוחות זה רלוונטי">
                        <select
                          value={mealTarget === 'all' ? 'all' : String(tpdEffective)}
                          onChange={(e) => {
                            const val = e.target.value;
                            const arr = [...tasks];
                            if (val === 'all') {
                              arr[ti] = {
                                ...arr[ti],
                                meal_target: 'all',
                                /** נשמור times_per_day כברירת מחדל בכל זאת — fallback אם פרופיל ריק */
                                times_per_day: arr[ti].times_per_day ?? 3,
                              };
                            } else {
                              arr[ti] = {
                                ...arr[ti],
                                meal_target: 'fixed',
                                times_per_day: Number(val),
                              };
                            }
                            setTasks(arr);
                          }}
                          className="input-field"
                        >
                          <option value="all">כל הארוחות של המשתמש (דינמי)</option>
                          <option value="1">ארוחה אחת</option>
                          <option value="2">2 ארוחות</option>
                          <option value="3">3 ארוחות עיקריות</option>
                        </select>
                      </Field>
                    </>
                  ) : null}

                  {schedule === 'multi_daily' ? (
                    <Field label="כמה פעמים ביום (1-6)">
                      <select
                        value={tpdEffective}
                        onChange={(e) => {
                          const arr = [...tasks];
                          arr[ti] = { ...arr[ti], times_per_day: Number(e.target.value) };
                          setTasks(arr);
                        }}
                        className="input-field"
                      >
                        {[2, 3, 4, 5, 6].map((n) => (
                          <option key={n} value={n}>
                            {n} פעמים
                          </option>
                        ))}
                      </select>
                    </Field>
                  ) : null}

                  {schedule === 'weekly' ? (
                    <Field label="יום בשבוע (לסימון השבועי)">
                      <select
                        value={wd}
                        onChange={(e) => {
                          const arr = [...tasks];
                          arr[ti] = { ...arr[ti], weekly_day: Number(e.target.value) };
                          setTasks(arr);
                        }}
                        className="input-field"
                      >
                        <option value={0}>ראשון</option>
                        <option value={1}>שני</option>
                        <option value={2}>שלישי</option>
                        <option value={3}>רביעי</option>
                        <option value={4}>חמישי</option>
                        <option value={5}>שישי</option>
                        <option value={6}>שבת</option>
                      </select>
                    </Field>
                  ) : null}

                  <button onClick={() => setTasks(prev => prev.filter((_, i) => i !== ti))}
                    className="text-red-500 hover:text-red-700 text-sm font-semibold">מחק משימה</button>
                </div>
              )}
            </div>
          );
          })}
          <AddButton label="הוסף משימה" onClick={() => setTasks(prev => [...prev, { ...emptyTask, id: genId() }])} />
        </Section>

        {/* ═══ HABITS ═══ */}
        <Section title={`הרגלים (${habits.length})`} icon={Sparkles} color="#10b981" sectionNumber={8} isVisible={activeSection === 'habits'}>
          <div className="rounded-xl p-3 text-xs leading-relaxed" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', color: '#065f46' }}>
            הרגל = דפוס חוזר (לא משימה חד-פעמית). מומלץ להוסיף עד 1-2 הרגלים בכל צעד.
            <br />
            דוגמה: &quot;לפני כל ארוחה שותה כוס מים&quot;.
          </div>
          {habits.map((h, hi) => (
            <div key={h.id || hi} className="rounded-xl border overflow-hidden" style={{ borderColor: 'rgba(16,185,129,0.24)', background: 'rgba(255,255,255,0.76)' }}>
              <button
                type="button"
                onClick={() => setExpandedHabit(expandedHabit === hi ? null : hi)}
                className="w-full p-3 flex items-center justify-between text-right"
                style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.16), rgba(6,182,212,0.10))' }}
              >
                <span className="text-sm font-bold text-emerald-900">הרגל {hi + 1}: {h.title || 'ללא כותרת'}</span>
                <ChevronDown className={`w-4 h-4 text-emerald-700 transition-transform ${expandedHabit === hi ? 'rotate-180' : ''}`} />
              </button>
              {expandedHabit === hi && (
                <div className="p-3 space-y-2">
                  <Field label="אימוג'י">
                    <input value={h.emoji} onChange={e => { const arr = [...habits]; arr[hi] = { ...arr[hi], emoji: e.target.value }; setHabits(arr); }}
                      className="w-16 input-field text-center text-xl" placeholder="💪" />
                  </Field>
                  <Field label="שם ההרגל (חובה)">
                    <input value={h.title} onChange={e => { const arr = [...habits]; arr[hi] = { ...arr[hi], title: e.target.value }; setHabits(arr); }}
                      className="input-field" placeholder="שם קצר להרגל (למשל: מים לפני ארוחה)" />
                  </Field>
                  <Field label="איך לבצע בפועל (אופציונלי)">
                    <input value={h.description || ''} onChange={e => { const arr = [...habits]; arr[hi] = { ...arr[hi], description: e.target.value || null }; setHabits(arr); }}
                      className="input-field" placeholder="תיאור תכל'ס למשתמש" />
                  </Field>
                  <Field label="תדירות">
                    <select value={h.frequency} onChange={e => { const arr = [...habits]; arr[hi] = { ...arr[hi], frequency: e.target.value as 'daily' | 'weekly' | 'per_meal' }; setHabits(arr); }}
                      className="input-field">
                      <option value="daily">יומי</option>
                      <option value="weekly">שבועי</option>
                      <option value="per_meal">לפני כל ארוחה</option>
                    </select>
                  </Field>
                  <Field label="ימים להשגת ההרגל (ברירת מחדל 14)">
                    <select
                      value={typeof h.target_days === 'number' ? h.target_days : 14}
                      onChange={(e) => {
                        const arr = [...habits];
                        arr[hi] = { ...arr[hi], target_days: Number(e.target.value) };
                        setHabits(arr);
                      }}
                      className="input-field"
                    >
                      <option value={7}>שבוע (7)</option>
                      <option value={14}>שבועיים (14)</option>
                      <option value={21}>3 שבועות (21)</option>
                      <option value={28}>4 שבועות (28)</option>
                    </select>
                  </Field>
                  {h.frequency === 'per_meal' ? (
                    <Field label="לפני או אחרי הארוחה">
                      <select
                        value={h.meal_timing === 'after' ? 'after' : 'before'}
                        onChange={(e) => {
                          const arr = [...habits];
                          arr[hi] = {
                            ...arr[hi],
                            meal_timing: e.target.value as 'before' | 'after',
                          };
                          setHabits(arr);
                        }}
                        className="input-field"
                      >
                        <option value="before">לפני הארוחה</option>
                        <option value="after">אחרי הארוחה</option>
                      </select>
                    </Field>
                  ) : null}
                  {h.frequency === 'weekly' ? (
                    <Field label="יום לבדיקה (שבועי)">
                      <select
                        value={h.weekly_day ?? 0}
                        onChange={(e) => {
                          const arr = [...habits];
                          arr[hi] = { ...arr[hi], weekly_day: Number(e.target.value) };
                          setHabits(arr);
                        }}
                        className="input-field"
                      >
                        <option value={0}>ראשון</option>
                        <option value={1}>שני</option>
                        <option value={2}>שלישי</option>
                        <option value={3}>רביעי</option>
                        <option value={4}>חמישי</option>
                        <option value={5}>שישי</option>
                        <option value={6}>שבת</option>
                      </select>
                    </Field>
                  ) : null}
                  <button onClick={() => setHabits(prev => prev.filter((_, i) => i !== hi))}
                    className="text-red-500 hover:text-red-700 text-sm font-semibold">מחק הרגל</button>
                </div>
              )}
            </div>
          ))}
          <AddButton label="הוסף הרגל" onClick={() => setHabits(prev => [...prev, { ...emptyHabit, id: genId() }])} />
        </Section>

        {/* ═══ PDF ═══ */}
        <Section title="קובץ PDF" icon={FileText} color="#ef4444" sectionNumber={9} isVisible={activeSection === 'pdf'}>
          <Field label="כתובת PDF">
            <input value={pdfUrl} onChange={e => setPdfUrl(e.target.value)}
              className="input-field" placeholder="https://..." dir="ltr" />
          </Field>
          <Field label="שם הקובץ">
            <input value={pdfName} onChange={e => setPdfName(e.target.value)}
              className="input-field" placeholder="סיכום השיעור.pdf" />
          </Field>
        </Section>

        <div className="flex items-center justify-between gap-3 rounded-2xl p-3 backdrop-blur-sm" style={{ background: 'rgba(255,255,255,0.68)', border: '1px solid rgba(255,255,255,0.9)' }}>
          <button
            type="button"
            onClick={goPrevSection}
            disabled={!canGoBack}
            className="px-4 py-2.5 rounded-xl font-bold text-sm border transition disabled:opacity-40"
            style={{ borderColor: 'rgba(0,0,0,0.12)', background: '#fff', color: '#374151' }}
          >
            שלב קודם
          </button>
          <span className="text-xs text-gray-500">שלב {activeSectionIndex + 1} מתוך {sectionOrder.length}</span>
          <button
            type="button"
            onClick={goNextSection}
            disabled={!canGoNext}
            className="px-4 py-2.5 rounded-xl font-bold text-sm text-white transition disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #047857, #10b981)' }}
          >
            שלב הבא
          </button>
        </div>
      </div>

      {/* Floating save */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
        <button onClick={handleSave} disabled={saving}
          className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl font-bold text-white shadow-2xl transition-all hover:scale-105 disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #047857, #10b981)', boxShadow: '0 8px 30px rgba(16,185,129,0.4)' }}>
          <Save className="w-5 h-5" />
          {saving ? 'שומר...' : 'שמור צעד'}
        </button>
      </div>
    </div>
  );
}

// ── Helper components ──

function Section({
  title,
  icon: Icon,
  color,
  sectionNumber,
  isVisible,
  children,
}: {
  title: string;
  icon: React.ElementType;
  color: string;
  sectionNumber: number;
  isVisible: boolean;
  children: React.ReactNode;
}) {
  if (!isVisible) return null;
  return (
    <div className="rounded-2xl p-4 sm:p-5 space-y-4 backdrop-blur-md" style={{ background: 'rgba(255,255,255,0.74)', border: '1px solid rgba(255,255,255,0.95)', boxShadow: '0 12px 28px rgba(6,78,59,0.10)' }}>
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full text-white text-xs font-black flex items-center justify-center" style={{ background: color }}>
          {sectionNumber}
        </div>
        <Icon className="w-4 h-4" style={{ color }} />
        <h2 className="font-black text-[15px]" style={{ color: '#1A1730' }}>{title}</h2>
      </div>
      {children}
    </div>
  );
}

function SectionTab({
  number,
  label,
  detail,
  color,
  active,
  onClick,
}: {
  number: number;
  label: string;
  detail?: string;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2 rounded-xl px-3 py-2.5 transition-all text-right"
      style={{
        background: active ? 'rgba(255,255,255,0.98)' : 'rgba(248,250,252,0.84)',
        border: active ? `1px solid ${color}` : '1px solid rgba(0,0,0,0.08)',
        boxShadow: active ? '0 4px 14px rgba(0,0,0,0.08)' : 'none',
      }}
    >
      <span className="w-6 h-6 rounded-full text-white text-[11px] font-black flex items-center justify-center" style={{ background: color }}>
        {number}
      </span>
      <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <span className="text-sm font-bold" style={{ color: active ? '#111827' : '#4b5563' }}>
          {label}
        </span>
        {detail ? (
          <span className="text-[11px] font-semibold leading-tight text-slate-500">{detail}</span>
        ) : null}
      </span>
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-bold text-gray-600 mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="w-full py-3 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 font-bold text-sm flex items-center justify-center gap-2 hover:border-emerald-300 hover:text-emerald-600 transition-all">
      <Plus className="w-4 h-4" /> {label}
    </button>
  );
}
