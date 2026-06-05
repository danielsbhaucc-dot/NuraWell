'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Loader2,
  Plus,
  Search,
  Trash2,
  Download,
  Save,
  FileText,
  FlaskConical,
  Settings2,
  X,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import {
  OpsPanelHeader,
  opsGlassBtnClass,
  opsGlassBtnPrimaryClass,
  opsGlassCardClass,
  opsInputClass,
} from '@/components/admin/OpsPanel';
import { glassPanelStyle } from '@/components/media-manager/glass-styles';
import { cn } from '@/lib/cn';

type KnowledgeItem = {
  id: string;
  title: string;
  body: string;
  data_type: 'step' | 'course';
  access_level: 'public' | 'premium';
  step_id: string | null;
  course_id: string | null;
  step_number: number | null;
  station_id: string | null;
  station_title: string | null;
  station_order: number | null;
  chunk_count: number;
  created_at: string;
  updated_at: string;
};

type JourneyStepRow = {
  id: string;
  step_number: number;
  title: string;
  journey_stations?: { title?: string | null } | { title?: string | null }[] | null;
};

type DataType = 'step' | 'course';
type AccessLevel = 'public' | 'premium';

const PRESET_COURSES: Array<{ id: string; label: string }> = [
  { id: 'course-intro', label: 'מבוא ופתיחה' },
  { id: 'course-nutrition', label: 'תזונה והרגלים' },
  { id: 'course-movement', label: 'תנועה וכושר' },
];

function stationTitleFromStepRow(s: JourneyStepRow): string {
  const j = s.journey_stations;
  const title =
    Array.isArray(j) && j[0]?.title
      ? j[0].title
      : j && typeof j === 'object' && 'title' in j
        ? (j as { title?: string | null }).title
        : null;
  const t = title && String(title).trim();
  return t || 'ללא תחנה';
}

function journeyStepOptionLabel(s: JourneyStepRow): string {
  return `${stationTitleFromStepRow(s)} · שלב ${s.step_number}: ${s.title}`;
}

function itemListLabel(item: KnowledgeItem): string {
  if (item.data_type === 'step' && item.step_number != null) {
    const st = item.station_title;
    return st ? `שלב ${item.step_number} · ${st}` : `שלב ${item.step_number}`;
  }
  if (item.course_id) return `קורס · ${item.course_id}`;
  return item.title || 'ללא כותרת';
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('he-IL', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

const emptyForm = {
  title: '',
  body: '',
  dataType: 'step' as DataType,
  accessLevel: 'public' as AccessLevel,
  selectedStepId: '',
  courseMode: 'preset' as 'preset' | 'custom',
  presetCourseId: PRESET_COURSES[0]?.id ?? '',
  customCourseId: '',
};

export function AlmogKnowledgeManager() {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [searchQ, setSearchQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);

  const [journeySteps, setJourneySteps] = useState<JourneyStepRow[]>([]);
  const [stepsLoading, setStepsLoading] = useState(true);
  const [stepsError, setStepsError] = useState<string | null>(null);

  const [form, setForm] = useState(emptyForm);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [syncingResearch, setSyncingResearch] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageErr, setMessageErr] = useState(false);
  const [editorTab, setEditorTab] = useState<'content' | 'meta'>('content');

  const effectiveCourseId = useMemo(() => {
    if (form.dataType !== 'course') return '';
    return (form.courseMode === 'preset' ? form.presetCourseId : form.customCourseId).trim();
  }, [form.courseMode, form.customCourseId, form.dataType, form.presetCourseId]);

  const loadList = useCallback(async (q: string) => {
    setListLoading(true);
    try {
      const params = new URLSearchParams({ per_page: '100' });
      if (q.trim()) params.set('q', q.trim());
      const res = await fetch(`/api/v1/admin/almog-knowledge?${params}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = (await res.json()) as {
        items?: KnowledgeItem[];
        total?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `שגיאה ${res.status}`);
      setItems(data.items ?? []);
      setTotal(data.total ?? data.items?.length ?? 0);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'שגיאת רשימה');
      setMessageErr(true);
      setItems([]);
      setTotal(0);
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setMessage(null);
    setMessageErr(false);
    try {
      const res = await fetch(`/api/v1/admin/almog-knowledge/${id}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = (await res.json()) as { item?: KnowledgeItem; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'שגיאה');
      const item = data.item;
      if (!item) throw new Error('לא נמצא');

      const preset = PRESET_COURSES.find((c) => c.id === item.course_id);
      setForm({
        title: item.title,
        body: item.body,
        dataType: item.data_type,
        accessLevel: item.access_level,
        selectedStepId: item.step_id ?? '',
        courseMode: preset ? 'preset' : 'custom',
        presetCourseId: preset?.id ?? PRESET_COURSES[0]?.id ?? '',
        customCourseId: preset ? '' : (item.course_id ?? ''),
      });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'שגיאת טעינה');
      setMessageErr(true);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void loadList(searchQ), 280);
    return () => clearTimeout(t);
  }, [searchQ, loadList]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStepsLoading(true);
      setStepsError(null);
      try {
        const res = await fetch('/api/v1/admin/journey-steps', { credentials: 'include' });
        const data = (await res.json().catch(() => null)) as JourneyStepRow[] | { error?: string } | null;
        if (!res.ok) {
          const err =
            data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
              ? data.error
              : `שגיאה ${res.status}`;
          if (!cancelled) setStepsError(err);
          return;
        }
        if (!Array.isArray(data)) {
          if (!cancelled) setStepsError('תגובת שרת לא צפויה');
          return;
        }
        const sorted = [...data].sort((a, b) => (a.step_number ?? 0) - (b.step_number ?? 0));
        if (!cancelled) setJourneySteps(sorted);
      } catch {
        if (!cancelled) setStepsError('שגיאת רשת בטעינת צעדים');
      } finally {
        if (!cancelled) setStepsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (selectedId && !isNew) void loadDetail(selectedId);
  }, [selectedId, isNew, loadDetail]);

  const closeEditor = useCallback(() => {
    setSelectedId(null);
    setIsNew(false);
    setForm(emptyForm);
  }, []);

  const editorOpen = isNew || selectedId != null;
  useEffect(() => {
    if (!editorOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving && !deleting && !deleteOpen) closeEditor();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [editorOpen, saving, deleting, deleteOpen, closeEditor]);

  const startNew = () => {
    setSelectedId(null);
    setIsNew(true);
    setEditorTab('content');
    setForm({
      ...emptyForm,
      selectedStepId: journeySteps[0]?.id ?? '',
    });
    setMessage(null);
    setMessageErr(false);
  };

  const selectItem = (id: string) => {
    setSelectedId(id);
    setIsNew(false);
    setEditorTab('content');
    setMessage(null);
    setMessageErr(false);
  };

  const groupedItems = useMemo(() => {
    const stepItems = items.filter((i) => i.data_type === 'step');
    const courseItems = items.filter((i) => i.data_type === 'course');
    return { stepItems, courseItems };
  }, [items]);

  const save = async () => {
    if (!form.body.trim()) {
      setMessage('נדרש תוכן');
      setMessageErr(true);
      return;
    }
    if (form.dataType === 'step' && !form.selectedStepId) {
      setMessage('בחרו שלב');
      setMessageErr(true);
      return;
    }
    if (form.dataType === 'course' && !effectiveCourseId) {
      setMessage('בחרו קורס');
      setMessageErr(true);
      return;
    }

    setSaving(true);
    setMessage(null);
    setMessageErr(false);

    const payload = {
      title: form.title.trim() || 'ללא כותרת',
      body: form.body,
      dataType: form.dataType,
      accessLevel: form.accessLevel,
      ...(form.dataType === 'step' ? { stepId: form.selectedStepId } : { courseId: effectiveCourseId }),
    };

    try {
      const url = isNew
        ? '/api/v1/admin/almog-knowledge'
        : `/api/v1/admin/almog-knowledge/${selectedId}`;
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { item?: KnowledgeItem; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'שמירה נכשלה');

      const saved = data.item;
      setMessage(isNew ? 'נוסף והוטמע בהצלחה' : 'עודכן והוטמע מחדש');
      setMessageErr(false);
      setIsNew(false);
      if (saved?.id) {
        setSelectedId(saved.id);
        void loadDetail(saved.id);
      }
      void loadList(searchQ);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'שגיאה');
      setMessageErr(true);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!selectedId || isNew) return;
    setDeleting(true);
    setDeleteOpen(false);
    setMessage(null);
    try {
      const res = await fetch(`/api/v1/admin/almog-knowledge/${selectedId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'מחיקה נכשלה');
      setMessage('נמחק');
      setMessageErr(false);
      setSelectedId(null);
      setIsNew(false);
      setForm(emptyForm);
      void loadList(searchQ);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'שגיאת מחיקה');
      setMessageErr(true);
    } finally {
      setDeleting(false);
    }
  };

  const runBackfill = async () => {
    setBackfilling(true);
    setMessage(null);
    setMessageErr(false);
    try {
      const res = await fetch('/api/v1/admin/almog-knowledge/backfill', {
        method: 'POST',
        credentials: 'include',
      });
      const data = (await res.json()) as {
        imported?: number;
        legacyBatches?: number;
        error?: string;
        errors?: string[];
      };
      if (!res.ok) throw new Error(data.error ?? 'ייבוא נכשל');
      setMessage(
        `יובאו ${data.imported ?? 0} מסמכים מתוך ${data.legacyBatches ?? 0} אצוות ישנות`
      );
      void loadList(searchQ);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'שגיאת ייבוא');
      setMessageErr(true);
    } finally {
      setBackfilling(false);
    }
  };

  const syncAllResearch = async () => {
    setSyncingResearch(true);
    setMessage(null);
    setMessageErr(false);
    try {
      const res = await fetch('/api/v1/admin/research/sync-all', {
        method: 'POST',
        credentials: 'include',
      });
      const data = (await res.json()) as {
        researchesSynced?: number;
        stepsSynced?: number;
        stepsScanned?: number;
        error?: string;
        errors?: string[];
      };
      if (!res.ok) throw new Error(data.error ?? 'סנכרון נכשל');
      const suffix = data.errors?.length ? ` שגיאות: ${data.errors.join(' | ')}` : '';
      setMessage(
        `סונכרנו ${data.researchesSynced ?? 0} מחקרים מתוך ${data.stepsScanned ?? 0} שלבים עם מחקרים מוכנים.${suffix}`
      );
      setMessageErr(Boolean(data.errors?.length));
      void loadList(searchQ);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'שגיאת סנכרון מחקרים');
      setMessageErr(true);
    } finally {
      setSyncingResearch(false);
    }
  };

  const canBackfill = total === 0 && !listLoading;

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={deleteOpen}
        title="מחיקת ידע"
        message="למחוק את המסמך ואת כל החלקים שהוטמעו באינדקס? לא ניתן לשחזר."
        confirmLabel="מחק"
        cancelLabel="ביטול"
        danger
        busy={deleting}
        onConfirm={() => void remove()}
        onCancel={() => !deleting && setDeleteOpen(false)}
      />

      <section className={opsGlassCardClass}>
        <OpsPanelHeader
          icon={BookOpen}
          title="ספריית הידע"
          tone="sky"
          description={`${total} מסמכי ידע · כל שמירה מעדכנת את האינדקס שאלמוג משתמש בו בשיחות`}
          actions={
            <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-none sm:flex sm:flex-wrap">
              {canBackfill ? (
                <button
                  type="button"
                  onClick={() => void runBackfill()}
                  disabled={backfilling}
                  className={`${opsGlassBtnClass} min-h-11 px-3 py-2 text-sm disabled:opacity-60`}
                >
                  {backfilling ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  ייבוא ידע קיים
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void syncAllResearch()}
                disabled={syncingResearch}
                className={`${opsGlassBtnClass} min-h-11 px-3 py-2 text-sm disabled:opacity-60`}
              >
                {syncingResearch ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FlaskConical className="w-4 h-4" />
                )}
                סנכרן מחקרים מכל המסע
              </button>
              <button
                type="button"
                onClick={startNew}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-emerald-600 to-teal-600 px-4 py-2 text-sm font-bold text-white shadow-md hover:brightness-105"
              >
                <Plus className="w-4 h-4" />
                הוספת ידע
              </button>
            </div>
          }
        />
      </section>

      {message ? (
        <p
          className={`text-sm font-medium rounded-xl px-3 py-2 ${
            messageErr
              ? 'text-red-800 bg-red-50 border border-red-200'
              : 'text-emerald-800 bg-emerald-50 border border-emerald-200'
          }`}
        >
          {message}
        </p>
      ) : null}

      <div>
        <section className="rounded-3xl border border-white/60 bg-white/55 backdrop-blur-md shadow-lg overflow-hidden flex flex-col">
          <div className="p-3 border-b border-white/50">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="search"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="חיפוש בכותרת או בתוכן..."
                className={`${opsInputClass} pr-10`}
                dir="rtl"
              />
            </div>
          </div>

          {listLoading ? (
            <p className="p-8 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
            </p>
          ) : items.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">
              אין עדיין ידע שמור. הוסיפו מסמך או ייבאו מהאינדקס הישן.
            </p>
          ) : (
            <ul className="overflow-y-auto flex-1 divide-y divide-slate-100/80">
              {groupedItems.stepItems.length > 0 ? (
                <li>
                  <p className="px-3 py-2 text-[10px] font-black uppercase tracking-wide text-emerald-800/70 bg-emerald-50/50">
                    לפי שלב במסע
                  </p>
                  <ul>
                    {groupedItems.stepItems.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => selectItem(item.id)}
                          className={[
                            'w-full text-right px-3 py-2.5 hover:bg-emerald-50/80 transition-colors',
                            selectedId === item.id && !isNew ? 'bg-emerald-50' : '',
                          ].join(' ')}
                        >
                          <p className="font-bold text-sm text-slate-900 truncate">{item.title}</p>
                          <p className="text-xs text-slate-500">{itemListLabel(item)}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {item.chunk_count} חלקים · {formatDate(item.updated_at)}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              ) : null}
              {groupedItems.courseItems.length > 0 ? (
                <li>
                  <p className="px-3 py-2 text-[10px] font-black uppercase tracking-wide text-amber-900/70 bg-amber-50/50">
                    לפי קורס
                  </p>
                  <ul>
                    {groupedItems.courseItems.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => selectItem(item.id)}
                          className={[
                            'w-full text-right px-3 py-2.5 hover:bg-amber-50/80 transition-colors',
                            selectedId === item.id && !isNew ? 'bg-amber-50' : '',
                          ].join(' ')}
                        >
                          <p className="font-bold text-sm text-slate-900 truncate">{item.title}</p>
                          <p className="text-xs text-slate-500">{itemListLabel(item)}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {item.chunk_count} חלקים · {formatDate(item.updated_at)}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              ) : null}
            </ul>
          )}
        </section>

      </div>

      {editorOpen ? (
        <div
          dir="rtl"
          role="dialog"
          aria-modal="true"
          aria-label={isNew ? 'מסמך ידע חדש' : 'עריכת מסמך ידע'}
          className="fixed inset-0 z-[55] flex items-end justify-center p-0 sm:items-center sm:p-4"
        >
          <button
            type="button"
            aria-label="סגור"
            onClick={() => !saving && !deleting && closeEditor()}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          />
          <div
            className="relative flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[1.75rem] shadow-[0_28px_80px_-16px_rgba(14,116,144,0.45)] ring-1 ring-white/50 sm:rounded-[1.75rem]"
            style={glassPanelStyle}
          >
            <div className="pointer-events-none absolute -left-16 -top-20 h-48 w-48 rounded-full bg-sky-400/25 blur-3xl" aria-hidden />
            <div className="pointer-events-none absolute -bottom-10 -right-10 h-40 w-40 rounded-full bg-emerald-400/20 blur-3xl" aria-hidden />
            <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent" />

            {/* כותרת + טאבים */}
            <header className="relative shrink-0 border-b border-white/40 bg-gradient-to-bl from-sky-100/55 via-white/25 to-emerald-100/45 px-4 pb-3 pt-4 sm:px-6">
              <button
                type="button"
                onClick={() => !saving && !deleting && closeEditor()}
                disabled={saving || deleting}
                className="absolute left-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/55 bg-white/35 text-slate-600 backdrop-blur-md transition hover:bg-white/55 disabled:opacity-50 sm:left-4 sm:top-4"
                aria-label="סגור"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="flex items-center gap-3 pl-10">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-lg shadow-sky-500/30 ring-1 ring-white/55">
                  <FileText className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-sky-700/85">
                    {isNew ? 'מסמך חדש' : 'עריכה'}
                  </p>
                  <h2 className="truncate bg-gradient-to-l from-sky-800 via-cyan-700 to-emerald-700 bg-clip-text font-display text-xl font-black text-transparent">
                    {isNew ? 'הוספת ידע לאלמוג' : form.title || 'עריכת ידע'}
                  </h2>
                  <p className="truncate text-xs text-slate-600">שמירה מפצלת ומטמיעה מחדש באינדקס</p>
                </div>
              </div>

              <div className="mt-4 flex gap-1.5 rounded-2xl border border-white/50 bg-white/30 p-1 backdrop-blur-md">
                {(
                  [
                    { key: 'content', label: 'תוכן', icon: FileText },
                    { key: 'meta', label: 'שיוך והגדרות', icon: Settings2 },
                  ] as const
                ).map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setEditorTab(key)}
                    className={cn(
                      'flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-bold transition-all sm:text-sm',
                      editorTab === key
                        ? 'bg-gradient-to-l from-sky-500 to-cyan-600 text-white shadow-md shadow-sky-500/25'
                        : 'text-slate-600 hover:bg-white/50',
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                    {label}
                  </button>
                ))}
              </div>
            </header>

            {/* גוף */}
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
              {detailLoading && !isNew ? (
                <p className="flex justify-center py-20">
                  <Loader2 className="w-7 h-7 animate-spin text-sky-600" />
                </p>
              ) : (
                <>
                  {editorTab === 'content' ? (
                    <div className="space-y-4">
                      <label className="block">
                        <span className="text-xs font-bold text-slate-700">כותרת (לניהול)</span>
                        <input
                          value={form.title}
                          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                          className={`${opsInputClass} mt-1`}
                          placeholder="למשל: טיפים לארוחת ערב"
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-bold text-slate-700">תוכן לאימון</span>
                        <textarea
                          value={form.body}
                          onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                          required
                          rows={12}
                          className={`${opsInputClass} mt-1 min-h-72 resize-y rounded-2xl px-4 py-3 text-[15px]`}
                          placeholder="הדביקו כאן את החומר המלא..."
                        />
                      </label>
                    </div>
                  ) : null}

                  {editorTab === 'meta' ? (
                    <div className="space-y-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block">
                          <span className="text-xs font-bold text-slate-700">שיוך</span>
                          <select
                            value={form.dataType}
                            onChange={(e) =>
                              setForm((f) => ({ ...f, dataType: e.target.value as DataType }))
                            }
                            className={`${opsInputClass} mt-1`}
                          >
                            <option value="step">שלב במסע</option>
                            <option value="course">קורס</option>
                          </select>
                        </label>
                        <label className="block">
                          <span className="text-xs font-bold text-slate-700">גישה</span>
                          <select
                            value={form.accessLevel}
                            onChange={(e) =>
                              setForm((f) => ({ ...f, accessLevel: e.target.value as AccessLevel }))
                            }
                            className={`${opsInputClass} mt-1`}
                          >
                            <option value="public">ציבורי (לפי התקדמות)</option>
                            <option value="premium">פרימיום (לפי קורס)</option>
                          </select>
                        </label>
                      </div>

                      {form.dataType === 'step' ? (
                        <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/40 p-3">
                          <label className="block text-xs font-bold text-emerald-950">שלב</label>
                          {stepsLoading ? (
                            <p className="text-sm mt-1">טוען...</p>
                          ) : stepsError ? (
                            <p className="text-sm text-red-700 mt-1">{stepsError}</p>
                          ) : (
                            <select
                              value={form.selectedStepId}
                              onChange={(e) =>
                                setForm((f) => ({ ...f, selectedStepId: e.target.value }))
                              }
                              className={`${opsInputClass} mt-1`}
                            >
                              {journeySteps.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {journeyStepOptionLabel(s)}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-amber-200/70 bg-amber-50/50 p-3 space-y-2">
                          <span className="text-xs font-bold text-amber-950">קורס</span>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setForm((f) => ({ ...f, courseMode: 'preset' }))}
                              className={cn(
                                opsGlassBtnClass,
                                'px-3 py-1',
                                form.courseMode === 'preset' && 'border-amber-400/60 bg-amber-500/20 text-amber-900',
                              )}
                            >
                              מהרשימה
                            </button>
                            <button
                              type="button"
                              onClick={() => setForm((f) => ({ ...f, courseMode: 'custom' }))}
                              className={cn(
                                opsGlassBtnClass,
                                'px-3 py-1',
                                form.courseMode === 'custom' && 'border-amber-400/60 bg-amber-500/20 text-amber-900',
                              )}
                            >
                              מזהה מותאם
                            </button>
                          </div>
                          {form.courseMode === 'preset' ? (
                            <select
                              value={form.presetCourseId}
                              onChange={(e) =>
                                setForm((f) => ({ ...f, presetCourseId: e.target.value }))
                              }
                              className={opsInputClass}
                            >
                              {PRESET_COURSES.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              value={form.customCourseId}
                              onChange={(e) =>
                                setForm((f) => ({ ...f, customCourseId: e.target.value }))
                              }
                              className={opsInputClass}
                              placeholder="מזהה קורס"
                            />
                          )}
                        </div>
                      )}
                    </div>
                  ) : null}
                </>
              )}
            </div>

            {/* פעולות */}
            <footer className="shrink-0 border-t border-white/40 bg-white/25 px-4 py-3 backdrop-blur-md sm:px-6">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving || deleting}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-sky-600 to-cyan-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-sky-500/25 transition active:scale-[0.99] disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saving ? 'שומר ומטמיע…' : 'שמירה והטמעה'}
                </button>
                {!isNew && selectedId ? (
                  <button
                    type="button"
                    onClick={() => setDeleteOpen(true)}
                    disabled={saving || deleting}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-300/70 bg-rose-50/70 px-4 py-3 text-sm font-bold text-rose-700 backdrop-blur-md transition hover:bg-rose-100/80 disabled:opacity-60"
                  >
                    {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    <span className="hidden sm:inline">מחיקה</span>
                  </button>
                ) : null}
              </div>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
