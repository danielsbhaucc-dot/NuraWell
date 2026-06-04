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
} from 'lucide-react';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';

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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageErr, setMessageErr] = useState(false);

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

  const startNew = () => {
    setSelectedId(null);
    setIsNew(true);
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

  const showEditor = isNew || selectedId != null;
  const canBackfill = total === 0 && !listLoading;

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={deleteOpen}
        title="מחיקת ידע"
        description="למחוק את המסמך ואת כל החלקים שהוטמעו באינדקס? לא ניתן לשחזר."
        confirmLabel="מחק"
        cancelLabel="ביטול"
        variant="danger"
        loading={deleting}
        onConfirm={() => void remove()}
        onCancel={() => !deleting && setDeleteOpen(false)}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          {total} מסמכי ידע · כל שמירה מעדכנת את האינדקס שאלמוג משתמש בו בשיחות
        </p>
        <div className="flex flex-wrap gap-2">
          {canBackfill ? (
            <button
              type="button"
              onClick={() => void runBackfill()}
              disabled={backfilling}
              className="inline-flex items-center gap-2 rounded-xl border border-amber-300/80 bg-amber-50/90 px-3 py-2 text-sm font-bold text-amber-950 hover:bg-amber-100 disabled:opacity-60"
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
            onClick={startNew}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-l from-emerald-600 to-teal-600 px-4 py-2 text-sm font-bold text-white shadow-md hover:brightness-105"
          >
            <Plus className="w-4 h-4" />
            הוספת ידע
          </button>
        </div>
      </div>

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

      <div className="grid gap-4 lg:grid-cols-[minmax(0,300px)_1fr] items-start">
        <section className="rounded-3xl border border-white/60 bg-white/55 backdrop-blur-md shadow-lg overflow-hidden flex flex-col max-h-[72vh]">
          <div className="p-3 border-b border-white/50">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="search"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="חיפוש בכותרת או בתוכן..."
                className="w-full pr-10 pl-3 py-2 rounded-xl border border-slate-200/80 bg-white/90 text-sm"
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

        <section className="rounded-3xl border border-white/60 bg-white/55 backdrop-blur-md shadow-lg p-5 sm:p-6 min-h-[420px]">
          {!showEditor ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
              <BookOpen className="w-10 h-10 text-emerald-600/50" />
              <p className="text-sm">בחרו מסמך מהרשימה או לחצו &quot;הוספת ידע&quot;</p>
            </div>
          ) : detailLoading && !isNew ? (
            <p className="flex justify-center py-20">
              <Loader2 className="w-7 h-7 animate-spin text-emerald-600" />
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-600" />
                <h2 className="text-lg font-black text-slate-900">
                  {isNew ? 'מסמך חדש' : 'עריכת ידע'}
                </h2>
              </div>

              <label className="block">
                <span className="text-xs font-bold text-slate-700">כותרת (לניהול)</span>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm"
                  placeholder="למשל: טיפים לארוחת ערב"
                />
              </label>

              <label className="block">
                <span className="text-xs font-bold text-slate-700">תוכן לאימון</span>
                <textarea
                  value={form.body}
                  onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                  required
                  rows={10}
                  className="mt-1 w-full resize-y rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 text-[15px] text-slate-900"
                  placeholder="הדביקו כאן את החומר המלא..."
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-bold text-slate-700">שיוך</span>
                  <select
                    value={form.dataType}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, dataType: e.target.value as DataType }))
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm"
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
                    className="mt-1 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm"
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
                      className="mt-1 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm"
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
                      className={`rounded-lg px-3 py-1 text-xs font-bold ${
                        form.courseMode === 'preset'
                          ? 'bg-amber-500 text-white'
                          : 'bg-white/80 text-amber-900'
                      }`}
                    >
                      מהרשימה
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, courseMode: 'custom' }))}
                      className={`rounded-lg px-3 py-1 text-xs font-bold ${
                        form.courseMode === 'custom'
                          ? 'bg-amber-500 text-white'
                          : 'bg-white/80 text-amber-900'
                      }`}
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
                      className="w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm"
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
                      className="w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm"
                      placeholder="מזהה קורס"
                    />
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving || deleting}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 text-white font-bold px-4 py-2.5 hover:bg-emerald-700 disabled:opacity-60"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {saving ? 'שומר ומטמיע…' : 'שמירה והטמעה'}
                </button>
                {!isNew && selectedId ? (
                  <button
                    type="button"
                    onClick={() => setDeleteOpen(true)}
                    disabled={saving || deleting}
                    className="inline-flex items-center gap-2 rounded-xl border-2 border-red-300 bg-red-50 text-red-800 font-bold px-4 py-2.5 hover:bg-red-100 disabled:opacity-60"
                  >
                    {deleting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                    מחיקה
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
