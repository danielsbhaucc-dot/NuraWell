'use client';

import { piiFetch } from '@/lib/platform/access/pii-fetch';
import { useCallback, useEffect, useState } from 'react';
import { Brain, Loader2, Trash2, Sparkles } from 'lucide-react';
import { glassCardStyle, glassPanelStyle } from '@/lib/module-api/site-content/components-media-manager-glass-styles';
import type { MemoryVectorCategory, UserMemoryListItem } from '@/lib/module-api/agent/lib-ai-upstash-vector-rest';

const CATEGORY_LABELS: Partial<Record<MemoryVectorCategory, string>> = {
  strength: 'חוזק',
  weakness: 'אתגר',
  success: 'הצלחה',
  failure: 'כשלון',
  schedule: 'לוח זמנים',
  goal: 'יעד',
  task_completed: 'משימה בוצעה',
  task_missed: 'משימה נפספסה',
  task_partial: 'משימה חלקית',
  habit: 'הרגל',
  trigger: 'טריגר',
  motivation: 'מוטיבציה',
  resistance: 'התנגדות',
  personal: 'אישי',
  health: 'בריאות',
  psychology: 'פסיכולוגיה',
  coaching: 'ליווי',
  risk: 'סיכון',
  preference: 'העדפה',
  timeline: 'ציר זמן',
  insight: 'תובנה',
  breakthrough: 'פריצת דרך',
};

const CATEGORY_STYLES: Partial<Record<MemoryVectorCategory, string>> = {
  strength: 'bg-primary-100/90 text-primary-900 border-primary-200/80',
  weakness: 'bg-accent-100/90 text-accent-950 border-accent-200/80',
  success: 'bg-secondary-100/90 text-secondary-900 border-secondary-200/80',
  failure: 'bg-coral-100/90 text-coral-900 border-coral-200/80',
  schedule: 'bg-iris-100/90 text-iris-900 border-iris-200/80',
  goal: 'bg-iris-100/90 text-iris-900 border-iris-200/80',
  insight: 'bg-secondary-100/90 text-secondary-900 border-secondary-200/80',
  breakthrough: 'bg-iris-100/90 text-iris-900 border-iris-200/80',
};

const DEFAULT_CATEGORY_STYLE = 'bg-surface/90 text-ink border-hairline/80';

function categoryLabel(cat: MemoryVectorCategory): string {
  return CATEGORY_LABELS[cat] ?? cat;
}

function categoryStyle(cat: MemoryVectorCategory): string {
  return CATEGORY_STYLES[cat] ?? DEFAULT_CATEGORY_STYLE;
}

const CATEGORY_ORDER: MemoryVectorCategory[] = [
  'strength',
  'weakness',
  'success',
  'failure',
  'schedule',
  'goal',
  'task_completed',
  'task_missed',
  'task_partial',
  'habit',
  'trigger',
  'motivation',
  'resistance',
  'personal',
  'health',
  'psychology',
  'coaching',
  'risk',
  'preference',
  'timeline',
  'insight',
  'breakthrough',
];

function formatMemoryDate(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('he-IL', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

type Props = {
  userId: string;
};

export function AlmogMemoryPanel({ userId }: Props) {
  const [items, setItems] = useState<UserMemoryListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await piiFetch(`/api/v1/admin/users/${userId}/memory`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = (await res.json()) as {
        items?: UserMemoryListItem[];
        configured?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? 'שגיאה');
      setItems(data.items ?? []);
      setConfigured(data.configured !== false);
      if (data.message && !data.items?.length) setError(data.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאת טעינה');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (id: string) => {
    setDeletingId(id);
    setError(null);
    try {
      const res = await piiFetch(`/api/v1/admin/users/${userId}/memory`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'מחיקה נכשלה');
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאת מחיקה');
    } finally {
      setDeletingId(null);
    }
  };

  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    entries: items.filter((i) => i.category === cat),
  })).filter((g) => g.entries.length > 0);

  return (
    <section
      className="rounded-2xl overflow-hidden"
      style={glassPanelStyle}
      aria-labelledby="almog-memory-heading"
    >
      <header className="flex items-start justify-between gap-3 px-4 py-3 border-b border-gc/40">
        <div className="flex items-center gap-2">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl text-iris-700"
            style={glassCardStyle}
          >
            <Brain className="w-5 h-5" aria-hidden />
          </div>
          <div>
            <h3 id="almog-memory-heading" className="text-sm font-black text-ink">
              מה אלמוג זוכר על המשתמש
            </h3>
            <p className="text-xs text-ink-soft/90 leading-relaxed">
              תובנות שנבנו מהשיחות וההרשמה — מוזרקות לצ&apos;אט כשהנושא רלוונטי
            </p>
          </div>
        </div>
        {!loading && items.length > 0 ? (
          <span className="shrink-0 rounded-lg bg-background-card/40 px-2 py-1 text-[10px] font-bold text-iris-900 border border-gc/50">
            {items.length} פריטים
          </span>
        ) : null}
      </header>

      <div className="p-4">
        {loading ? (
          <p className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-iris-600" />
          </p>
        ) : !configured ? (
          <p className="text-sm text-ink-soft text-center py-6">
            אינדקס הזיכרון לא מוגדר בסביבה זו
          </p>
        ) : items.length === 0 ? (
          <p className="text-sm text-ink-faint text-center py-6">
            {error ?? 'עדיין אין זיכרון סמנטי — ייווצר מהשיחות וההרשמה'}
          </p>
        ) : (
          <div className="space-y-4">
            {error ? (
              <p className="text-xs font-medium text-coral-700 bg-coral-50/80 rounded-lg px-2 py-1">
                {error}
              </p>
            ) : null}
            {grouped.map(({ category, entries }) => (
              <div key={category}>
                <p className="text-[10px] font-black uppercase tracking-wide text-ink-faint mb-2">
                  {categoryLabel(category)}
                </p>
                <ul className="space-y-2">
                  {entries.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-xl px-3 py-2.5 flex gap-2 items-start justify-between"
                      style={glassCardStyle}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${categoryStyle(category)}`}
                          >
                            {categoryLabel(category)}
                          </span>
                          {item.isInsight ? (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-iris-800">
                              <Sparkles className="w-3 h-3" />
                              תובנה
                            </span>
                          ) : null}
                          {item.memoryLevel && item.memoryLevel >= 3 ? (
                            <span className="text-[10px] text-ink-faint">רמה {item.memoryLevel}</span>
                          ) : null}
                        </div>
                        <p className="text-sm text-ink leading-relaxed">{item.text}</p>
                        {item.updatedAt ? (
                          <p className="text-[10px] text-ink-faint mt-1">
                            עודכן {formatMemoryDate(item.updatedAt)}
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => void remove(item.id)}
                        disabled={deletingId === item.id}
                        title="מחק זיכרון שגוי"
                        className="shrink-0 p-1.5 rounded-lg text-coral-700/80 hover:bg-coral-50/80 hover:text-coral-800 disabled:opacity-50"
                      >
                        {deletingId === item.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
