'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  Save, ArrowRight, Plus, Trash2, Video, HelpCircle,
  Gamepad2, Heart, FileText, BookOpen, ListChecks, Sparkles, Brain, ChevronDown, Volume2,
  Loader2, Plug, AudioLines, UploadCloud, Check, Wand2, ChevronUp
} from 'lucide-react';
import type {
  JourneyStep, QuizQuestion, GameItem, CommitmentData,
  Research, JourneyTask, JourneyHabit, QuestionTtsMeta,
  JourneyTaskLevelingConfig,
} from '../../lib/types/journey';
import { useMediaManager } from '@/components/media-manager/MediaManagerProvider';
import type { MediaAsset } from '@/components/media-manager/types';
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
type AudioPlaylistOption = { id: string; title: string; is_published: boolean; track_count: number };

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

type AiFillMode = 'initial' | 'clarifying' | 'generating' | 'done';

type AiClarificationQuestion = {
  id: string;
  label: string;
  help_text?: string;
  input_type: 'textarea' | 'text' | 'select';
  required: boolean;
};

function createDefaultLeveling(): JourneyTaskLevelingConfig {
  const easy = genId();
  const start = genId();
  const target = genId();
  return {
    levels: [
      { id: easy, label: 'רמה קלה', description: '', order: 0, is_minimum_viable: true },
      { id: start, label: 'רמת התחלה', description: '', order: 1 },
      { id: target, label: 'יעד מומלץ', description: '', order: 2, is_recommended: true },
    ],
    start_level_id: start,
    recommended_level_id: target,
    level_up_after_success_days: 7,
    allow_user_downgrade: true,
    allow_user_upgrade: true,
    ai_rationale: null,
  };
}

function updateTaskLeveling(
  tasks: JourneyTask[],
  taskIndex: number,
  updater: (prev: JourneyTaskLevelingConfig) => JourneyTaskLevelingConfig
): JourneyTask[] {
  const arr = [...tasks];
  const task = arr[taskIndex];
  if (!task) return tasks;
  const prev = task.leveling ?? createDefaultLeveling();
  arr[taskIndex] = { ...task, leveling: updater(prev) };
  return arr;
}

/** שלבי השמירה כשיש הקראות (TTS) — מוצגים עם אחוזים כדי שלא ייראה תקוע. */
const SAVE_STAGES = [
  { key: 'connect', label: 'מתחבר ל-ElevenLabs', icon: Plug, until: 12 },
  { key: 'transcribe', label: 'ממיר טקסט לדיבור (Liam)', icon: AudioLines, until: 45 },
  { key: 'audio', label: 'יוצר ודוחס אודיו', icon: Volume2, until: 80 },
  { key: 'upload', label: 'מעלה ל-Cloudflare R2 ושומר', icon: UploadCloud, until: 100 },
] as const;

function activeSaveStageIndex(pct: number): number {
  const idx = SAVE_STAGES.findIndex((s) => pct < s.until);
  return idx === -1 ? SAVE_STAGES.length - 1 : idx;
}

/** שלבי המילוי האוטומטי עם AI — מציג בדיוק מה ה-LLM עושה כרגע. */
const AIFILL_STAGES = [
  { key: 'connect', label: 'מתחבר ל-AI (LLaMA 4)', icon: Plug, until: 15 },
  { key: 'analyze', label: 'קורא ומנתח את הטקסט', icon: Brain, until: 42 },
  { key: 'generate', label: 'מנסח כותרת, סיכום, שאלות, משימות והרגלים', icon: Wand2, until: 68 },
  { key: 'research', label: 'נכנס לקישורי המחקרים, קורא ומסכם לזיכרון', icon: FileText, until: 92 },
  { key: 'finalize', label: 'מסדר ומשבץ בכל הסעיפים', icon: ListChecks, until: 100 },
] as const;

/**
 * מחלץ הודעת שגיאה קריאה מתגובת שרת — מטפל גם במקרה ש-error הוא אובייקט
 * (למשל פירוט ולידציה) כדי שלא יוצג "[object Object]" למשתמש.
 */
function extractErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const err = (data as { error?: unknown }).error;
  if (typeof err === 'string') return err.trim() || null;
  if (err && typeof err === 'object') {
    const maybeMsg = (err as { message?: unknown }).message;
    if (typeof maybeMsg === 'string' && maybeMsg.trim()) return maybeMsg.trim();
    try {
      return JSON.stringify(err);
    } catch {
      return null;
    }
  }
  return null;
}

function TtsStatusBadge({ text, tts }: { text: string; tts?: QuestionTtsMeta | null }) {
  const trimmed = text.trim();
  if (!trimmed) {
    return (
      <span className="text-[11px] font-semibold text-gray-400">אין טקסט להקראה</span>
    );
  }
  if (tts?.status === 'ready' && tts.url) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
        <Volume2 className="w-3 h-3" />
        הקראה מוכנה
        {tts.size_bytes ? (
          <span className="font-normal text-emerald-600/80">
            ({Math.max(1, Math.round(tts.size_bytes / 1024))}KB)
          </span>
        ) : null}
      </span>
    );
  }
  if (tts?.status === 'error') {
    return (
      <span className="text-[11px] font-bold text-red-600" title={tts.error}>
        שגיאת הקראה — ינסה שוב בשמירה
      </span>
    );
  }
  return (
    <span className="text-[11px] font-semibold text-amber-700">יווצר/יעודכן בשמירה</span>
  );
}

export function StepEditor({ step }: StepEditorProps) {
  const { open: openMediaManager } = useMediaManager();
  const router = useRouter();
  const pathname = usePathname();
  const journeyListPath = pathname.startsWith('/ops') ? '/ops/journey' : '/journey';
  const isNew = !step;
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);
  const [saveStageIndex, setSaveStageIndex] = useState(0);
  const [saveHasTts, setSaveHasTts] = useState(false);
  const saveTimerRef = useRef<number | null>(null);
  const [researchScanning, setResearchScanning] = useState<number | null>(null);
  const [researchSyncing, setResearchSyncing] = useState<number | 'all' | null>(null);
  const [researchMessage, setResearchMessage] = useState<string | null>(null);
  const [ttsSaveMessage, setTtsSaveMessage] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<EditorSectionId>('basic');
  const [expandedResearch, setExpandedResearch] = useState<number | null>(0);
  const [expandedTask, setExpandedTask] = useState<number | null>(0);
  const [expandedHabit, setExpandedHabit] = useState<number | null>(0);
  const [expandedQuiz, setExpandedQuiz] = useState<number | null>(null);
  const [expandedGame, setExpandedGame] = useState<number | null>(null);

  // AI auto-fill (LLaMA 4 via Groq/OpenRouter)
  const [aiPanelOpen, setAiPanelOpen] = useState(isNew);
  const [aiSourceText, setAiSourceText] = useState('');
  const [aiFilling, setAiFilling] = useState(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiProgress, setAiProgress] = useState(0);
  const [aiStageIndex, setAiStageIndex] = useState(0);
  const aiTimerRef = useRef<number | null>(null);
  const [aiFillMode, setAiFillMode] = useState<AiFillMode>('initial');
  const [aiSessionId, setAiSessionId] = useState<string | null>(null);
  const [aiClarificationPhase, setAiClarificationPhase] = useState<
    'research' | 'lesson_transcript' | 'user_goal'
  >('research');
  const [aiSummarySoFar, setAiSummarySoFar] = useState('');
  const [aiClarificationQuestions, setAiClarificationQuestions] = useState<AiClarificationQuestion[]>([]);
  const [aiClarificationAnswers, setAiClarificationAnswers] = useState<Record<string, string>>({});

  // Basic fields
  const [title, setTitle] = useState(step?.title || '');
  const [description, setDescription] = useState(step?.description || '');
  const [stepNumber, setStepNumber] = useState(step?.step_number || 1);
  const [isPublished, setIsPublished] = useState(step?.is_published || false);
  const [durationMinutes, setDurationMinutes] = useState(step?.duration_minutes || 8);
  const [summaryText, setSummaryText] = useState(step?.summary_text || '');
  const [stations, setStations] = useState<JourneyStationOption[]>([]);
  const [stationId, setStationId] = useState<string>(step?.station_id ?? '');
  const [audioPlaylists, setAudioPlaylists] = useState<AudioPlaylistOption[]>([]);
  const [audioPlaylistId, setAudioPlaylistId] = useState<string>(step?.audio_playlist_id ?? '');

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/admin/audio/playlists', { credentials: 'include' });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as unknown;
        if (!Array.isArray(data) || cancelled) return;
        setAudioPlaylists(data as AudioPlaylistOption[]);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) window.clearInterval(saveTimerRef.current);
      if (aiTimerRef.current) window.clearInterval(aiTimerRef.current);
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

  const runAiGeneration = async (
    text: string,
    options?: { clarificationAnswers?: Record<string, string>; analysisSummary?: string }
  ) => {
    setAiFillMode('generating');
    setAiFilling(true);
    setAiError(null);
    setAiMessage(null);
    setAiProgress(4);
    setAiStageIndex(0);

    const stopTicker = () => {
      if (aiTimerRef.current) {
        window.clearInterval(aiTimerRef.current);
        aiTimerRef.current = null;
      }
    };
    const startLlmTicker = () => {
      stopTicker();
      const startedAt = Date.now();
      aiTimerRef.current = window.setInterval(() => {
        const elapsed = Date.now() - startedAt;
        const pct = Math.min(58, 12 + Math.round((elapsed / 22000) * 46));
        setAiProgress((prev) => (pct > prev ? pct : prev));
      }, 250);
    };

    const fail = (msg: string) => {
      stopTicker();
      setAiError(msg);
      setAiFillMode('initial');
    };

    type StreamStep = {
      title: string;
      description: string;
      summary_text: string;
      duration_minutes: number;
      quiz_questions: QuizQuestion[];
      game_items: GameItem[];
      commitment: CommitmentData | null;
      researches: Research[];
      tasks: JourneyTask[];
      habits: JourneyHabit[];
      attention_stops: ImmersiveAttentionStop[];
    };
    type StreamEvent =
      | { phase: 'analyze' }
      | { phase: 'generated'; provider?: string; detected_links?: number; researches?: number; research_to_scan?: number }
      | { phase: 'research'; processed: number; total: number }
      | {
          phase: 'done';
          provider?: string;
          step: StreamStep;
          research_scan?: { detected_links?: number; researches?: number; scanned: number; errors: string[] };
        }
      | { phase: 'error'; error?: string };

    let doneEvent: Extract<StreamEvent, { phase: 'done' }> | null = null;
    let streamError: string | null = null;

    const applyEvent = (evt: StreamEvent) => {
      switch (evt.phase) {
        case 'analyze':
          setAiStageIndex(1);
          setAiProgress((p) => Math.max(p, 12));
          startLlmTicker();
          break;
        case 'generated': {
          stopTicker();
          setAiStageIndex(2);
          setAiProgress((p) => Math.max(p, 62));
          if (!evt.research_to_scan) {
            setAiStageIndex(3);
            setAiProgress((p) => Math.max(p, 90));
          }
          break;
        }
        case 'research': {
          stopTicker();
          setAiStageIndex(3);
          const ratio = evt.total > 0 ? evt.processed / evt.total : 1;
          setAiProgress((p) => Math.max(p, Math.min(94, 62 + Math.round(ratio * 30))));
          break;
        }
        case 'done':
          stopTicker();
          doneEvent = evt;
          setAiStageIndex(AIFILL_STAGES.length - 1);
          setAiProgress(100);
          break;
        case 'error':
          streamError = evt.error || 'המילוי האוטומטי נכשל';
          break;
      }
    };

    try {
      const res = await fetch('/api/v1/admin/journey-steps/ai-fill', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceText: text,
          stepNumber,
          clarificationAnswers: options?.clarificationAnswers,
          analysisSummary: options?.analysisSummary,
        }),
      });

      if (!res.ok || !res.body) {
        const errData = (await res.json().catch(() => null)) as { error?: unknown } | null;
        throw new Error(extractErrorMessage(errData) ?? `שגיאה ${res.status}`);
      }

      startLlmTicker();
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const consumeLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        let evt: StreamEvent | null = null;
        try {
          evt = JSON.parse(trimmed) as StreamEvent;
        } catch {
          return;
        }
        if (evt) applyEvent(evt);
      };

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) consumeLine(line);
      }
      if (buffer.trim()) consumeLine(buffer);

      stopTicker();

      if (streamError) {
        fail(streamError);
        return;
      }
      const done = doneEvent as Extract<StreamEvent, { phase: 'done' }> | null;
      if (!done || !done.step) {
        fail('המילוי האוטומטי לא הושלם. נסו שוב.');
        return;
      }

      const s = done.step;
      if (s.title) setTitle(s.title);
      if (s.description) setDescription(s.description);
      if (s.summary_text) setSummaryText(s.summary_text);
      if (s.duration_minutes) setDurationMinutes(s.duration_minutes);
      setQuizQuestions(s.quiz_questions ?? []);
      setGameItems(s.game_items ?? []);
      setCommitment(s.commitment ?? null);
      setResearches(s.researches ?? []);
      setTasks(s.tasks ?? []);
      setHabits(s.habits ?? []);
      setImmersiveAttentionStops(s.attention_stops ?? []);

      const scannedCount = done.research_scan?.scanned ?? 0;
      const detectedLinks = done.research_scan?.detected_links ?? 0;
      const parts = [
        s.quiz_questions?.length ? `${s.quiz_questions.length} שאלות` : null,
        s.game_items?.length ? `${s.game_items.length} טענות משחק` : null,
        s.commitment ? 'התחייבות' : null,
        s.researches?.length
          ? `${s.researches.length} מחקרים${scannedCount ? ` (${scannedCount} נקראו מהקישור)` : ''}`
          : null,
        s.tasks?.length ? `${s.tasks.length} משימות` : null,
        s.habits?.length ? `${s.habits.length} הרגלים` : null,
        s.attention_stops?.length ? `${s.attention_stops.length} נקודות קשב` : null,
      ].filter(Boolean);
      const linksNote =
        detectedLinks > 1 ? `זוהו ${detectedLinks} קישורי מחקר ונסרקו אוטומטית. ` : '';
      setAiMessage(
        `מולא אוטומטית (${done.provider ?? 'AI'}): ${parts.join(' · ') || 'כותרת וסיכום'}. ` +
          linksNote +
          'עברו על הסעיפים, הוסיפו וידאו, ואז שמרו — סיכומי המחקרים המלאים יסונכרנו לזיכרון של אלמוג בשמירה.'
      );
      setAiFillMode('done');
      setAiPanelOpen(false);
    } catch (e) {
      fail(e instanceof Error ? e.message : 'שגיאה במילוי אוטומטי');
    } finally {
      stopTicker();
      setAiFilling(false);
    }
  };

  const handleAiClarificationSubmit = async () => {
    const text = aiSourceText.trim();
    for (const q of aiClarificationQuestions) {
      if (q.required && !aiClarificationAnswers[q.id]?.trim()) {
        setAiError(`נא לענות על: ${q.label}`);
        return;
      }
    }
    setAiError(null);
    setAiFilling(true);
    try {
      const res = await fetch('/api/v1/admin/journey-steps/ai-fill/session', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'answer',
          sourceText: text,
          sessionId: aiSessionId,
          phase: aiClarificationPhase,
          summarySoFar: aiSummarySoFar,
          answers: aiClarificationAnswers,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        status?: string;
        error?: string;
        sessionId?: string;
        phase?: 'research' | 'lesson_transcript' | 'user_goal';
        summary_so_far?: string;
        questions?: AiClarificationQuestion[];
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'שגיאה בשליחת תשובות');
      }
      if (data.sessionId) setAiSessionId(data.sessionId);
      if (data.summary_so_far) setAiSummarySoFar(data.summary_so_far);
      if (data.status === 'ready') {
        await runAiGeneration(text, {
          clarificationAnswers: aiClarificationAnswers,
          analysisSummary: data.summary_so_far ?? aiSummarySoFar,
        });
        return;
      }
      setAiClarificationPhase(data.phase ?? 'user_goal');
      setAiClarificationQuestions(data.questions ?? []);
      setAiClarificationAnswers({});
      setAiFillMode('clarifying');
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'שגיאה בשיחת חידוד');
    } finally {
      setAiFilling(false);
    }
  };

  const handleAiFill = async () => {
    const text = aiSourceText.trim();
    if (text.length < 40) {
      setAiError('הדבק טקסט ארוך יותר (לפחות 40 תווים) כדי ש-AI יוכל למלא את הצעד.');
      return;
    }

    const hasExistingContent =
      title.trim() ||
      summaryText.trim() ||
      description.trim() ||
      quizQuestions.length > 0 ||
      gameItems.length > 0 ||
      tasks.length > 0 ||
      habits.length > 0 ||
      researches.length > 0 ||
      immersiveAttentionStops.length > 0 ||
      commitment;
    if (
      hasExistingContent &&
      !window.confirm('המילוי האוטומטי יחליף את התוכן הקיים בכל הסעיפים (חוץ מהווידאו). להמשיך?')
    ) {
      return;
    }

    setAiError(null);
    setAiMessage(null);
    setAiFillMode('initial');
    setAiClarificationAnswers({});
    setAiClarificationQuestions([]);
    setAiSummarySoFar('');
    setAiSessionId(null);

    setAiFilling(true);
    try {
      const res = await fetch('/api/v1/admin/journey-steps/ai-fill/session', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', sourceText: text }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        status?: string;
        error?: string;
        sessionId?: string;
        phase?: 'research' | 'lesson_transcript' | 'user_goal';
        summary_so_far?: string;
        questions?: AiClarificationQuestion[];
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'שגיאה בהתחלת session חידוד');
      }
      if (data.sessionId) setAiSessionId(data.sessionId);
      if (data.summary_so_far) setAiSummarySoFar(data.summary_so_far);

      if (data.status === 'ready') {
        await runAiGeneration(text, { analysisSummary: data.summary_so_far ?? '' });
        return;
      }

      setAiClarificationPhase(data.phase ?? 'research');
      setAiClarificationQuestions(data.questions ?? []);
      setAiFillMode('clarifying');
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'שגיאה במילוי אוטומטי');
    } finally {
      setAiFilling(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) { alert('חובה להזין כותרת'); return; }

    const ttsCount =
      quizQuestions.filter((q) => q.question.trim()).length +
      gameItems.filter((g) => g.statement.trim()).length;
    const hasTts = ttsCount > 0;

    setSaving(true);
    setTtsSaveMessage(null);
    setSaveHasTts(hasTts);
    setSaveProgress(hasTts ? 3 : 30);
    setSaveStageIndex(0);

    // הערכת משך לפי כמות פריטי ההקראה — מניע את האחוזים כדי שלא ייראה תקוע.
    const estTotalMs = hasTts ? Math.max(7000, ttsCount * 6500) : 4000;
    const startedAt = Date.now();
    if (saveTimerRef.current) window.clearInterval(saveTimerRef.current);
    saveTimerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const pct = Math.min(95, Math.round((elapsed / estTotalMs) * 100));
      setSaveProgress((prev) => (pct > prev ? pct : prev));
      setSaveStageIndex(activeSaveStageIndex(pct));
    }, 200);

    const finishProgress = () => {
      if (saveTimerRef.current) {
        window.clearInterval(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };

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
      audio_playlist_id: audioPlaylistId.trim() ? audioPlaylistId.trim() : null,
    };

    if (!isNew) body.id = step!.id;

    try {
      const res = await fetch('/api/v1/admin/journey-steps', {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      finishProgress();
      setSaveStageIndex(SAVE_STAGES.length - 1);
      setSaveProgress(100);

      if (res.ok) {
        const saved = (await res.json()) as {
          quiz_questions?: QuizQuestion[];
          game_items?: GameItem[];
          tts_sync?: { generated: number; skipped: number; deleted: number; errors?: string[] };
        };
        if (Array.isArray(saved.quiz_questions)) setQuizQuestions(saved.quiz_questions);
        if (Array.isArray(saved.game_items)) setGameItems(saved.game_items);
        if (saved.tts_sync) {
          const { generated, skipped, deleted, errors } = saved.tts_sync;
          const errSuffix = errors?.length ? ` (${errors.length} שגיאות)` : '';
          setTtsSaveMessage(
            `הקראות: ${generated} נוצרו, ${skipped} ללא שינוי, ${deleted} נמחקו${errSuffix}`
          );
        }
        router.push(journeyListPath);
        router.refresh();
      } else {
        const err = await res.json().catch(() => ({}));
        alert('שגיאה: ' + (err.error || 'Unknown'));
        setSaving(false);
      }
    } catch (e) {
      finishProgress();
      alert('שגיאה בשמירה: ' + (e instanceof Error ? e.message : 'תקלת רשת'));
      setSaving(false);
    }
  };

  const patchResearch = (index: number, patch: Partial<Research>) => {
    setResearches((prev) => {
      const arr = [...prev];
      arr[index] = { ...arr[index], ...patch };
      return arr;
    });
  };

  const scanResearch = async (index: number) => {
    const research = researches[index];
    if (!research) return;
    if (!research.url && !research.source_text?.trim()) {
      alert('צריך קישור למחקר או טקסט/Abstract בשדה הטקסט לסריקה');
      return;
    }

    setResearchScanning(index);
    setResearchMessage(null);
    patchResearch(index, { scan_status: 'scanning', scan_error: undefined });

    try {
      const res = await fetch('/api/v1/admin/research/scan', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: research.title,
          authors: research.authors,
          year: research.year,
          journal: research.journal,
          finding: research.finding,
          url: research.url,
          sourceText: research.source_text,
        }),
      });
      const data = (await res.json()) as Partial<Research> & {
        error?: string;
        sourceText?: string;
        provider?: string;
        model?: string;
      };
      if (!res.ok) throw new Error(data.error ?? 'סריקה נכשלה');

      patchResearch(index, {
        source_text: data.sourceText ?? research.source_text,
        ai_summary: data.ai_summary ?? '',
        key_findings: data.key_findings ?? [],
        practical_takeaway: data.practical_takeaway ?? '',
        limitations: data.limitations ?? '',
        evidence_level: data.evidence_level ?? 'unknown',
        last_scanned_at: data.last_scanned_at ?? new Date().toISOString(),
        scan_status: 'ready',
        scan_error: undefined,
      });
      setResearchMessage(`המחקר נסרק בהצלחה (${data.provider ?? 'AI'}). שמור/י את הצעד כדי לסנכרן אוטומטית לאלמוג.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'שגיאת סריקה';
      patchResearch(index, { scan_status: 'error', scan_error: msg });
      setResearchMessage(msg);
    } finally {
      setResearchScanning(null);
    }
  };

  const syncResearchesToAlmog = async (index?: number) => {
    if (isNew || !step?.id) {
      alert('צריך לשמור את הצעד לפני סנכרון ידני לאלמוג');
      return;
    }

    const research = typeof index === 'number' ? researches[index] : null;
    setResearchSyncing(typeof index === 'number' ? index : 'all');
    setResearchMessage(null);

    try {
      const res = await fetch('/api/v1/admin/research/sync', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stepId: step.id,
          ...(research?.id ? { researchId: research.id } : {}),
        }),
      });
      const data = (await res.json()) as {
        researches?: Research[];
        synced?: number;
        skipped?: number;
        error?: string;
        errors?: string[];
      };
      if (!res.ok) throw new Error(data.error ?? 'סנכרון נכשל');
      if (Array.isArray(data.researches)) setResearches(data.researches);
      const suffix = data.errors?.length ? ` שגיאות: ${data.errors.join(' | ')}` : '';
      setResearchMessage(`סונכרנו ${data.synced ?? 0} מחקרים לאלמוג.${suffix}`);
    } catch (e) {
      setResearchMessage(e instanceof Error ? e.message : 'שגיאת סנכרון');
    } finally {
      setResearchSyncing(null);
    }
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
    <div className="relative mx-auto max-w-4xl pb-24">
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
        className="mb-5 flex flex-col gap-3 rounded-3xl px-3 py-3 backdrop-blur-md sm:flex-row sm:items-center"
        style={{ background: 'rgba(255,255,255,0.62)', border: '1px solid rgba(255,255,255,0.65)', boxShadow: '0 10px 24px rgba(16,24,40,0.08)' }}
      >
        <div className="flex min-w-0 items-center gap-3">
        <button onClick={() => router.push(journeyListPath)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm transition-colors"
          style={{ background: 'linear-gradient(135deg, #0f766e, #10b981)', border: '1px solid rgba(255,255,255,0.55)' }}>
          <ArrowRight className="w-5 h-5 text-white" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-lg font-black sm:text-xl" style={{ color: '#1A1730' }}>
          {isNew ? 'צעד חדש' : `עריכת: ${step!.title}`}
        </h1>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold text-white shadow-lg transition-all active:scale-[0.99] disabled:opacity-50 sm:mr-auto sm:w-auto sm:min-h-10 sm:py-2.5"
          style={{ background: 'linear-gradient(135deg, #047857, #10b981)' }}>
          <Save className="w-4 h-4" />
          {saving ? 'שומר...' : 'שמור'}
        </button>
      </div>

      <div className="space-y-5">
        {/* ═══ AI AUTO-FILL ═══ */}
        <div
          className="rounded-2xl p-4 space-y-3 backdrop-blur-md"
          style={{
            background: 'linear-gradient(135deg, rgba(124,58,237,0.10), rgba(37,99,235,0.10))',
            border: '1px solid rgba(124,58,237,0.22)',
            boxShadow: '0 12px 28px rgba(76,29,149,0.12)',
          }}
        >
          <button
            type="button"
            onClick={() => setAiPanelOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 text-right"
          >
            <span className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}>
                <Wand2 className="h-4 w-4 text-white" />
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-black" style={{ color: '#3730a3' }}>מילוי אוטומטי עם AI (LLaMA 4)</span>
                <span className="text-[11px] font-semibold text-violet-700/80">הדביקו טקסט ארוך — ה-AI ימלא את כל הסעיפים חוץ מהווידאו</span>
              </span>
            </span>
            {aiPanelOpen ? <ChevronUp className="h-4 w-4 text-violet-700" /> : <ChevronDown className="h-4 w-4 text-violet-700" />}
          </button>

          {aiPanelOpen && (
            <div className="space-y-3">
              <textarea
                value={aiSourceText}
                onChange={(e) => setAiSourceText(e.target.value)}
                disabled={aiFilling}
                className="input-field min-h-[140px] leading-relaxed"
                placeholder="הדביקו כאן את התוכן הגולמי של השיעור (תמלול / סיכום / טקסט מקצועי). ה-AI ייתן כותרת, סיכום, שאלות הבנה, משחק, התחייבות, מחקרים, משימות, הרגלים ונקודות קשב — ויסונכרן לזיכרון של אלמוג בשמירה."
              />
              <div className="flex flex-wrap items-center gap-3">
                {aiFillMode !== 'clarifying' ? (
                  <button
                    type="button"
                    onClick={() => void handleAiFill()}
                    disabled={aiFilling || aiSourceText.trim().length < 40}
                    className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-lg transition-all active:scale-[0.98] disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}
                  >
                    {aiFilling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {aiFilling ? 'ה-AI מנתח…' : 'התחל מילוי חכם'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleAiClarificationSubmit()}
                    disabled={aiFilling}
                    className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-lg transition-all active:scale-[0.98] disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}
                  >
                    {aiFilling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {aiFilling ? 'שולח תשובות…' : 'שלח תשובות והמשך'}
                  </button>
                )}
                <span className="text-[11px] font-semibold text-violet-700/70">
                  {aiSourceText.trim().length} תווים · הווידאו תמיד נשאר למילוי ידני
                </span>
              </div>

              {aiFillMode === 'clarifying' && aiClarificationQuestions.length > 0 && (
                <div className="space-y-3 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(124,58,237,0.2)' }}>
                  <p className="text-xs font-bold text-violet-900">
                    שלב חידוד:{' '}
                    {aiClarificationPhase === 'research'
                      ? 'מחקר'
                      : aiClarificationPhase === 'lesson_transcript'
                        ? 'תמלול שיעור'
                        : 'יעד משתמש'}
                  </p>
                  {aiSummarySoFar ? (
                    <p className="text-[11px] leading-relaxed text-violet-800/80">{aiSummarySoFar}</p>
                  ) : null}
                  {aiClarificationQuestions.map((q) => (
                    <Field key={q.id} label={q.label}>
                      {q.input_type === 'textarea' ? (
                        <textarea
                          value={aiClarificationAnswers[q.id] ?? ''}
                          onChange={(e) =>
                            setAiClarificationAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                          }
                          disabled={aiFilling}
                          className="input-field min-h-[80px]"
                          placeholder={q.help_text ?? ''}
                        />
                      ) : (
                        <input
                          value={aiClarificationAnswers[q.id] ?? ''}
                          onChange={(e) =>
                            setAiClarificationAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                          }
                          disabled={aiFilling}
                          className="input-field"
                          placeholder={q.help_text ?? ''}
                        />
                      )}
                    </Field>
                  ))}
                </div>
              )}
              {aiError && (
                <p className="rounded-xl px-3 py-2 text-xs font-semibold text-red-700" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)' }}>
                  {aiError}
                </p>
              )}
            </div>
          )}

          {aiMessage && (
            <p className="rounded-xl px-3 py-2 text-xs font-semibold leading-relaxed" style={{ background: 'rgba(16,185,129,0.12)', color: '#065f46', border: '1px solid rgba(16,185,129,0.25)' }}>
              {aiMessage}
            </p>
          )}
        </div>

        {/* ═══ SECTION NAVIGATION ═══ */}
        <div
          className="rounded-2xl p-4 space-y-3 backdrop-blur-md"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.75), rgba(241,245,249,0.75))',
            border: '1px solid rgba(255,255,255,0.9)',
            boxShadow: '0 14px 32px rgba(15,23,42,0.12)',
          }}
        >
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h2
              className="text-sm font-black px-3 py-1.5 rounded-lg"
              style={{ color: '#1A1730', background: 'linear-gradient(135deg, rgba(16,185,129,0.18), rgba(59,130,246,0.18))' }}
            >
              מבנה הצעד
            </h2>
            <span className="text-xs text-gray-600">החליקו הצידה במובייל ובחרו את החלק לעריכה</span>
          </div>
          <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0">
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
          <Field label="מוזיקת רקע (אופציונלי)">
            <select
              value={audioPlaylistId}
              onChange={(e) => setAudioPlaylistId(e.target.value)}
              className="input-field"
            >
              <option value="">ללא מוזיקה</option>
              {audioPlaylists.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.is_published}>
                  {p.title} ({p.track_count} רצועות){p.is_published ? '' : ' — טיוטה'}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-gray-500 leading-relaxed">
              הפלייליסט ינוגן ברקע לאורך כל הצעד (מהשלב הראשון ועד הסיכום), יונמך בזמן וידאו, ויוצג לו
              קרדיט. ניתן לנהל פלייליסטים במסך &quot;מוזיקת רקע&quot;. רק פלייליסט מפורסם זמין לבחירה.
            </p>
          </Field>
          <Field label="טקסט סיכום">
            <textarea value={summaryText} onChange={e => setSummaryText(e.target.value)}
              className="input-field min-h-[100px]" placeholder="סיכום מפורט של תוכן השיעור..." />
          </Field>
        </Section>

        {/* ═══ VIDEO ═══ */}
        <Section title="וידאו" icon={Video} color="#3b82f6" sectionNumber={2} isVisible={activeSection === 'video'}>
          <button
            type="button"
            onClick={() =>
              openMediaManager({
                kind: 'video',
                mode: 'pick',
                title: 'בחר וידאו',
                onSelect: (asset: MediaAsset) => {
                  setVideoProvider('bunny');
                  setVideoExternalId(asset.external_id ?? '');
                  setVideoExternalUrl(asset.external_url ?? asset.url ?? '');
                },
              })
            }
            className="mb-3 rounded-xl border border-blue-300/60 bg-blue-500/10 px-4 py-2 text-sm font-bold text-blue-900"
          >
            העלאת וידאו
          </button>
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
          <p className="text-xs text-emerald-900/80 leading-relaxed rounded-xl px-3 py-2" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)' }}>
            בשמירה, טקסט השאלה יומר אוטומטית לקול Liam (ElevenLabs v3), יידחס, יועלה ל-R2 ויישמר בספריית המדיה.
            קובץ קיים לא ייווצר מחדש אם הטקסט לא השתנה.
          </p>
          {ttsSaveMessage && activeSection === 'quiz' && (
            <p className="rounded-xl px-3 py-2 text-xs font-semibold text-emerald-800" style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.2)' }}>
              {ttsSaveMessage}
            </p>
          )}
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
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <TtsStatusBadge text={q.question} tts={q.tts} />
                    {q.tts?.status === 'ready' && q.tts.url ? (
                      <audio controls preload="none" src={q.tts.url} className="h-8 max-w-[220px]" />
                    ) : null}
                  </div>
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
          <p className="text-xs text-amber-900/80 leading-relaxed rounded-xl px-3 py-2" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)' }}>
            רק טקסט הטענה יוקרא — לא תשובות ולא הסברים. הקובץ נוצר פעם אחת ונשמר ב-R2 תחת תחנה + צעד.
          </p>
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
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <TtsStatusBadge text={g.statement} tts={g.tts} />
                    {g.tts?.status === 'ready' && g.tts.url ? (
                      <audio controls preload="none" src={g.tts.url} className="h-8 max-w-[220px]" />
                    ) : null}
                  </div>
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
                  className="input-field" placeholder="למשל: לשתות 2 כוסות מים לפני כל ארוחה" />
                <p className="mt-1.5 text-xs text-gray-500 leading-relaxed">
                  אל תכתבו &quot;אני מתחייב&quot; — המערכת מוסיפה אוטומטית פתיח מותאם מגדר
                  (&quot;אני מתחייב&quot; / &quot;אני מתחייבת&quot;) לפי פרופיל המשתמש. כתבו רק את ההמשך.
                </p>
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
          <div className="rounded-xl p-3 text-xs leading-relaxed" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.18)', color: '#4c1d95' }}>
            הזינו קישור או הדביקו Abstract/טקסט מרכזי, לחצו &quot;סרוק בזול&quot;, ואז שמרו את הצעד. בשמירה המחקרים המסוכמים נכנסים אוטומטית ל-RAG של אלמוג. אפשר גם לסנכרן ידנית.
          </div>
          {researchMessage && (
            <p className="rounded-xl px-3 py-2 text-xs font-semibold" style={{ background: 'rgba(99,102,241,0.10)', color: '#3730a3', border: '1px solid rgba(99,102,241,0.18)' }}>
              {researchMessage}
            </p>
          )}
          {researches.length > 0 && (
            <button
              type="button"
              onClick={() => void syncResearchesToAlmog()}
              disabled={researchSyncing !== null || isNew}
              className="rounded-xl px-3 py-2 text-sm font-bold disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)', color: 'white' }}
            >
              {researchSyncing === 'all' ? 'מסנכרן...' : 'סנכרן את כל המחקרים לאלמוג'}
            </button>
          )}
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
                  <textarea
                    value={r.source_text || ''}
                    onChange={e => patchResearch(ri, { source_text: e.target.value })}
                    className="input-field min-h-[90px]"
                    placeholder="טקסט לסריקה (Abstract / קטעים חשובים / טקסט מלא קצר). אם הקישור חסום או PDF, הדביקו כאן."
                  />

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void scanResearch(ri)}
                      disabled={researchScanning === ri}
                      className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold disabled:opacity-60"
                      style={{ background: 'rgba(124,58,237,0.12)', color: '#5b21b6', border: '1px solid rgba(124,58,237,0.22)' }}
                    >
                      <Sparkles className="w-4 h-4" />
                      {researchScanning === ri ? 'סורק...' : 'סרוק בזול'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void syncResearchesToAlmog(ri)}
                      disabled={researchSyncing === ri || isNew || !(r.ai_summary || r.key_findings?.length)}
                      className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold disabled:opacity-50"
                      style={{ background: 'rgba(37,99,235,0.12)', color: '#1d4ed8', border: '1px solid rgba(37,99,235,0.22)' }}
                    >
                      <Brain className="w-4 h-4" />
                      {researchSyncing === ri ? 'מסנכרן...' : 'סנכרן לאלמוג'}
                    </button>
                    {r.rag_doc_id && (
                      <span className="rounded-lg bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-800 border border-emerald-200">
                        מסונכרן ל-RAG
                      </span>
                    )}
                    {r.scan_status === 'ready' && !r.rag_doc_id && (
                      <span className="rounded-lg bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800 border border-amber-200">
                        נסרק, ממתין לשמירה/סנכרון
                      </span>
                    )}
                  </div>

                  {(r.ai_summary || r.key_findings?.length || r.practical_takeaway || r.limitations) && (
                    <div className="rounded-xl p-3 space-y-2 text-sm" style={{ background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(124,58,237,0.16)' }}>
                      <p className="text-xs font-black text-violet-900">מה אלמוג יקבל מהמחקר</p>
                      {r.ai_summary && <p className="leading-relaxed text-slate-700">{r.ai_summary}</p>}
                      {r.key_findings?.length ? (
                        <ul className="list-disc pr-5 text-slate-700 space-y-1">
                          {r.key_findings.map((finding, idx) => <li key={`${r.id}-finding-${idx}`}>{finding}</li>)}
                        </ul>
                      ) : null}
                      {r.practical_takeaway && <p className="text-slate-700"><strong>משמעות לשיעור:</strong> {r.practical_takeaway}</p>}
                      {r.limitations && <p className="text-slate-600"><strong>סייגים:</strong> {r.limitations}</p>}
                      <p className="text-xs text-slate-500">רמת ראיות: {r.evidence_level ?? 'unknown'}</p>
                    </div>
                  )}

                  {r.scan_error && (
                    <p className="rounded-lg bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 border border-red-200">
                      {r.scan_error}
                    </p>
                  )}

                  <button type="button" onClick={() => setResearches(prev => prev.filter((_, i) => i !== ri))}
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

                  {/* ── שכבות קושי ── */}
                  <div className="rounded-lg p-3 space-y-2" style={{ background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.15)' }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-orange-900">סולם רמות קושי</span>
                      <button
                        type="button"
                        onClick={() => {
                          const arr = [...tasks];
                          if (arr[ti]?.leveling) {
                            arr[ti] = { ...arr[ti]!, leveling: null };
                          } else {
                            arr[ti] = { ...arr[ti]!, leveling: createDefaultLeveling() };
                          }
                          setTasks(arr);
                        }}
                        className="text-[11px] font-semibold text-orange-700 hover:text-orange-900"
                      >
                        {t.leveling ? 'הסר סולם' : 'הוסף סולם'}
                      </button>
                    </div>
                    {t.leveling ? (
                      <div className="space-y-2">
                        <Field label="ימים להצעת העלאת רמה">
                          <input
                            type="number"
                            min={1}
                            max={90}
                            value={t.leveling.level_up_after_success_days}
                            onChange={(e) => {
                              setTasks(
                                updateTaskLeveling(tasks, ti, (lv) => ({
                                  ...lv,
                                  level_up_after_success_days: Math.min(
                                    90,
                                    Math.max(1, Number(e.target.value) || 7)
                                  ),
                                }))
                              );
                            }}
                            className="input-field w-24"
                          />
                        </Field>
                        {(t.leveling.levels ?? []).map((lvl, li) => (
                          <div
                            key={lvl.id || li}
                            className="rounded-lg p-2 space-y-1"
                            style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(249,115,22,0.12)' }}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                value={lvl.label}
                                onChange={(e) => {
                                  setTasks(
                                    updateTaskLeveling(tasks, ti, (lv) => {
                                      const levels = [...lv.levels];
                                      levels[li] = { ...levels[li]!, label: e.target.value };
                                      return { ...lv, levels };
                                    })
                                  );
                                }}
                                className="input-field flex-1 min-w-[120px]"
                                placeholder="שם הרמה"
                              />
                              <label className="flex items-center gap-1 text-[10px] font-semibold text-orange-800">
                                <input
                                  type="radio"
                                  name={`start-${t.id}`}
                                  checked={t.leveling?.start_level_id === lvl.id}
                                  onChange={() => {
                                    setTasks(
                                      updateTaskLeveling(tasks, ti, (lv) => ({
                                        ...lv,
                                        start_level_id: lvl.id,
                                      }))
                                    );
                                  }}
                                />
                                התחלה
                              </label>
                              <label className="flex items-center gap-1 text-[10px] font-semibold text-orange-800">
                                <input
                                  type="radio"
                                  name={`rec-${t.id}`}
                                  checked={t.leveling?.recommended_level_id === lvl.id}
                                  onChange={() => {
                                    setTasks(
                                      updateTaskLeveling(tasks, ti, (lv) => ({
                                        ...lv,
                                        recommended_level_id: lvl.id,
                                      }))
                                    );
                                  }}
                                />
                                יעד
                              </label>
                              <button
                                type="button"
                                onClick={() => {
                                  setTasks(
                                    updateTaskLeveling(tasks, ti, (lv) => {
                                      const levels = lv.levels.filter((_, i) => i !== li);
                                      if (levels.length < 2) return lv;
                                      return {
                                        ...lv,
                                        levels: levels.map((l, i) => ({ ...l, order: i })),
                                        start_level_id: lv.start_level_id === lvl.id ? levels[0]!.id : lv.start_level_id,
                                        recommended_level_id:
                                          lv.recommended_level_id === lvl.id
                                            ? levels[levels.length - 1]!.id
                                            : lv.recommended_level_id,
                                      };
                                    })
                                  );
                                }}
                                className="text-red-500 text-[10px] font-semibold"
                              >
                                מחק
                              </button>
                            </div>
                            <input
                              value={lvl.description}
                              onChange={(e) => {
                                setTasks(
                                  updateTaskLeveling(tasks, ti, (lv) => {
                                    const levels = [...lv.levels];
                                    levels[li] = { ...levels[li]!, description: e.target.value };
                                    return { ...lv, levels };
                                  })
                                );
                              }}
                              className="input-field text-xs"
                              placeholder="תיאור הרמה"
                            />
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            setTasks(
                              updateTaskLeveling(tasks, ti, (lv) => {
                                const newId = genId();
                                return {
                                  ...lv,
                                  levels: [
                                    ...lv.levels,
                                    {
                                      id: newId,
                                      label: 'רמה חדשה',
                                      description: '',
                                      order: lv.levels.length,
                                    },
                                  ],
                                };
                              })
                            );
                          }}
                          className="text-[11px] font-semibold text-orange-700"
                        >
                          + הוסף רמה
                        </button>
                      </div>
                    ) : (
                      <p className="text-[10px] text-orange-800/70">ללא סולם — המשימה תוצג ברמה אחת בלבד.</p>
                    )}
                  </div>

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
          <button
            type="button"
            onClick={() =>
              openMediaManager({
                kind: 'file',
                mode: 'pick',
                title: 'בחר קובץ PDF',
                onSelect: (asset: MediaAsset) => {
                  setPdfUrl(asset.url ?? asset.public_url ?? '');
                  setPdfName(asset.title ?? asset.original_filename ?? 'קובץ.pdf');
                },
              })
            }
            className="mb-3 rounded-xl border border-red-300/60 bg-red-500/10 px-4 py-2 text-sm font-bold text-red-900"
          >
            העלאת קובץ
          </button>
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

      {/* Floating save — מוגבה בנייד כדי שיהיה נוח ללחיצה */}
      <div
        className="fixed left-1/2 z-40 -translate-x-1/2 bottom-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] sm:bottom-6"
      >
        <button onClick={handleSave} disabled={saving}
          className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl font-bold text-white shadow-2xl transition-all hover:scale-105 disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #047857, #10b981)', boxShadow: '0 8px 30px rgba(16,185,129,0.4)' }}>
          <Save className="w-5 h-5" />
          {saving ? 'שומר...' : 'שמור צעד'}
        </button>
      </div>

      {/* Save progress overlay */}
      {saving && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/45 backdrop-blur-sm px-4" dir="rtl">
          <div
            className="w-full max-w-sm rounded-3xl p-6 text-center"
            style={{ background: 'rgba(255,255,255,0.97)', border: '1px solid rgba(255,255,255,0.9)', boxShadow: '0 24px 60px rgba(15,23,42,0.35)' }}
          >
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: 'linear-gradient(135deg, #047857, #10b981)' }}>
              <Loader2 className="h-7 w-7 animate-spin text-white" />
            </div>

            <h3 className="text-lg font-black" style={{ color: '#1A1730' }}>
              {saveHasTts ? 'שומר ויוצר הקראות' : 'שומר צעד'}
            </h3>
            <p className="mt-1 text-sm font-bold text-emerald-700">
              {saveHasTts ? `${SAVE_STAGES[saveStageIndex]?.label}…` : 'שומר את הצעד…'}
            </p>

            {/* Progress bar */}
            <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-emerald-100/70">
              <div
                className="h-full rounded-full transition-all duration-200"
                style={{ width: `${saveProgress}%`, background: 'linear-gradient(90deg, #047857, #10b981, #34d399)' }}
              />
            </div>
            <p className="mt-2 text-2xl font-black tabular-nums" style={{ color: '#047857' }}>
              {saveProgress}%
            </p>

            {saveHasTts && (
              <ul className="mt-4 space-y-2 text-right">
                {SAVE_STAGES.map((stage, i) => {
                  const done = i < saveStageIndex || saveProgress >= 100;
                  const active = i === saveStageIndex && saveProgress < 100;
                  const StageIcon = stage.icon;
                  return (
                    <li
                      key={stage.key}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold transition-colors"
                      style={{
                        background: active ? 'rgba(16,185,129,0.12)' : done ? 'rgba(16,185,129,0.06)' : 'rgba(0,0,0,0.03)',
                        color: done ? '#047857' : active ? '#065f46' : '#94a3b8',
                      }}
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg" style={{ background: done || active ? 'rgba(16,185,129,0.2)' : 'rgba(0,0,0,0.05)' }}>
                        {done ? <Check className="h-3.5 w-3.5" /> : active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <StageIcon className="h-3.5 w-3.5" />}
                      </span>
                      <span className="flex-1">{stage.label}</span>
                    </li>
                  );
                })}
              </ul>
            )}

            <p className="mt-4 text-xs text-slate-500 leading-relaxed">
              {saveHasTts
                ? 'יצירת אודיו ב-ElevenLabs עשויה לקחת מספר שניות לכל שאלה. אל תסגור/י את החלון.'
                : 'רק רגע, שומר את הצעד…'}
            </p>
          </div>
        </div>
      )}

      {/* AI fill progress overlay */}
      {aiFilling && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/45 backdrop-blur-sm px-4" dir="rtl">
          <div
            className="w-full max-w-sm rounded-3xl p-6 text-center"
            style={{ background: 'rgba(255,255,255,0.97)', border: '1px solid rgba(255,255,255,0.9)', boxShadow: '0 24px 60px rgba(76,29,149,0.35)' }}
          >
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}>
              <Loader2 className="h-7 w-7 animate-spin text-white" />
            </div>

            <h3 className="text-lg font-black" style={{ color: '#1A1730' }}>
              מילוי אוטומטי עם AI
            </h3>
            <p className="mt-1 text-sm font-bold text-violet-700">
              {AIFILL_STAGES[aiStageIndex]?.label}…
            </p>

            <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-violet-100/70">
              <div
                className="h-full rounded-full transition-all duration-200"
                style={{ width: `${aiProgress}%`, background: 'linear-gradient(90deg, #7c3aed, #6366f1, #2563eb)' }}
              />
            </div>
            <p className="mt-2 text-2xl font-black tabular-nums" style={{ color: '#5b21b6' }}>
              {aiProgress}%
            </p>

            <ul className="mt-4 space-y-2 text-right">
              {AIFILL_STAGES.map((stage, i) => {
                const done = i < aiStageIndex || aiProgress >= 100;
                const active = i === aiStageIndex && aiProgress < 100;
                const StageIcon = stage.icon;
                return (
                  <li
                    key={stage.key}
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold transition-colors"
                    style={{
                      background: active ? 'rgba(124,58,237,0.12)' : done ? 'rgba(124,58,237,0.06)' : 'rgba(0,0,0,0.03)',
                      color: done ? '#5b21b6' : active ? '#4c1d95' : '#94a3b8',
                    }}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg" style={{ background: done || active ? 'rgba(124,58,237,0.2)' : 'rgba(0,0,0,0.05)' }}>
                      {done ? <Check className="h-3.5 w-3.5" /> : active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <StageIcon className="h-3.5 w-3.5" />}
                    </span>
                    <span className="flex-1">{stage.label}</span>
                  </li>
                );
              })}
            </ul>

            <p className="mt-4 text-xs text-slate-500 leading-relaxed">
              סריקת קישורי המחקרים עשויה לקחת מספר שניות. אל תסגור/י את החלון.
            </p>
          </div>
        </div>
      )}
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
      className="flex min-w-[13.5rem] snap-start items-center gap-2 rounded-xl px-3 py-2.5 text-right backdrop-blur-md transition-all sm:min-w-0 sm:w-full"
      style={{
        background: active
          ? `linear-gradient(135deg, ${color}18, rgba(255,255,255,0.55))`
          : 'linear-gradient(135deg, rgba(255,255,255,0.42), rgba(255,255,255,0.18))',
        border: active
          ? `1px solid ${color}55`
          : '1px solid rgba(255,255,255,0.55)',
        boxShadow: active
          ? `0 8px 24px ${color}22, inset 0 1px 0 rgba(255,255,255,0.65)`
          : '0 2px 10px rgba(15,23,42,0.06), inset 0 1px 0 rgba(255,255,255,0.45)',
      }}
    >
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black text-white shadow-sm"
        style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
      >
        {number}
      </span>
      <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <span className="text-sm font-bold" style={{ color: active ? '#0f172a' : '#475569' }}>
          {label}
        </span>
        {detail ? (
          <span className="text-[11px] font-semibold leading-tight" style={{ color: active ? '#64748b' : '#94a3b8' }}>
            {detail}
          </span>
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
