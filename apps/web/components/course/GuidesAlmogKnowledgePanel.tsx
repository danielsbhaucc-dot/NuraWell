'use client';

import { useState } from 'react';
import { BookOpen, ChevronDown, Database } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface GuideKnowledgeEntry {
  courseId: string;
  title: string;
  chapterCount: number;
  chunkCount: number;
  indexed: boolean;
}

interface GuidesAlmogKnowledgePanelProps {
  entries: GuideKnowledgeEntry[];
}

export function GuidesAlmogKnowledgePanel({ entries }: GuidesAlmogKnowledgePanelProps) {
  const [open, setOpen] = useState(false);
  if (entries.length === 0) return null;

  const indexed = entries.filter((e) => e.indexed);
  const allIndexed = indexed.length === entries.length;

  return (
    <div
      className="mb-4 rounded-2xl overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(236,253,245,0.95) 0%, rgba(240,253,250,0.88) 100%)',
        border: '1px solid rgba(20,184,166,0.28)',
        boxShadow: '0 6px 20px rgba(6,78,59,0.08)',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 p-3.5 text-right"
        dir="rtl"
      >
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ background: 'linear-gradient(145deg, #047857, #14b8a6)' }}
        >
          <Database className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-emerald-950">מה אלמוג יודע על המדריכים שלך</p>
          <p className="text-xs text-emerald-700/80 mt-0.5">
            {allIndexed
              ? `אלמוג מכיר את כל ${entries.length} המדריכים — תוכן מלא, פרקים ומשימות`
              : `אלמוג מכיר ${indexed.length} מתוך ${entries.length} מדריכים`}
          </p>
        </div>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-emerald-600 transition', open && 'rotate-180')}
        />
      </button>

      {open ? (
        <div className="border-t border-emerald-100/80 px-3.5 pb-3.5 pt-2 space-y-2" dir="rtl">
          {entries.map((entry) => (
            <div
              key={entry.courseId}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm"
              style={{
                background: entry.indexed ? 'rgba(255,255,255,0.72)' : 'rgba(254,243,199,0.5)',
                border: `1px solid ${entry.indexed ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.3)'}`,
              }}
            >
              <BookOpen className="h-4 w-4 shrink-0 text-emerald-600" />
              <div className="min-w-0 flex-1">
                <p className="font-bold text-emerald-950 truncate">{entry.title}</p>
                <p className="text-[11px] text-emerald-700/75">
                  {entry.chapterCount} פרקים
                  {entry.indexed ? ` · ${entry.chunkCount} קטעי ידע` : ' · עדיין לא נסרק ל-RAG'}
                </p>
              </div>
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
                style={{
                  background: entry.indexed ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.2)',
                  color: entry.indexed ? '#047857' : '#b45309',
                }}
              >
                {entry.indexed ? 'מוכן' : 'חסר'}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
