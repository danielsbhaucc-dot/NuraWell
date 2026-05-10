'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Plus, Edit3, Eye, EyeOff, Trash2, GripVertical,
  Video, HelpCircle, Gamepad2, Heart, FileText, CheckCircle2, Brain
} from 'lucide-react';
import type { JourneyStep } from '../../lib/types/journey';
import { parseImmersiveAttentionStops } from '../../lib/journey/immersiveAttentionStops';

interface AdminStepsListProps {
  steps: JourneyStep[];
  /** כשהכותרת מוצגת בעמוד העוטף (למשל `/admin/journey`) — מסתירים כפילות כותרת */
  showIntro?: boolean;
}

export function AdminStepsList({ steps: initialSteps, showIntro = true }: AdminStepsListProps) {
  const [steps, setSteps] = useState(initialSteps);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const handleTogglePublish = async (stepId: string, currentPublished: boolean) => {
    const res = await fetch('/api/v1/admin/journey-steps', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: stepId, is_published: !currentPublished }),
    });
    if (res.ok) {
      setSteps(prev => prev.map(s => s.id === stepId ? { ...s, is_published: !currentPublished } : s));
    }
  };

  const handleDelete = async (stepId: string) => {
    if (!confirm('האם למחוק את הצעד הזה? לא ניתן לשחזר.')) return;
    setIsDeleting(stepId);
    const res = await fetch('/api/v1/admin/journey-steps', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: stepId }),
    });
    if (res.ok) {
      setSteps(prev => prev.filter(s => s.id !== stepId));
    }
    setIsDeleting(null);
  };

  return (
    <div>
      <div
        className={[
          'mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4',
          showIntro ? 'sm:justify-between' : 'sm:justify-end',
        ].join(' ')}
      >
        {showIntro ? (
          <div className="min-w-0">
            <h1
              className="text-2xl font-black leading-tight text-slate-900 sm:text-[1.75rem]"
              style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
            >
              ניהול צעדי מסע
            </h1>
            <p className="mt-1 text-sm text-slate-500">{steps.length} צעדים</p>
          </div>
        ) : null}
        <Link
          href="/admin/steps/new"
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-emerald-600 to-teal-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-500/25 transition-all hover:brightness-110 active:scale-[0.98] sm:w-auto sm:min-w-0 sm:self-end sm:py-2.5"
        >
          <Plus className="h-4 w-4" />
          <span>צעד חדש</span>
        </Link>
      </div>

      {/* Steps table */}
      <div className="space-y-3">
        {steps.map((step, index) => (
          <motion.div
            key={step.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="flex flex-col gap-3 rounded-2xl border border-white/40 bg-white/45 p-4 shadow-[0_8px_28px_rgba(15,23,42,0.08)] backdrop-blur-xl transition-all sm:flex-row sm:items-center sm:gap-4 sm:hover:border-emerald-400/35 sm:hover:bg-white/55 sm:hover:shadow-[0_10px_36px_rgba(16,185,129,0.12)]"
            style={{
              opacity: isDeleting === step.id ? 0.5 : 1,
            }}
          >
            {(() => {
              const attentionStopsCount = parseImmersiveAttentionStops(step.text_content).length;
              return (
                <>
            <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
            {/* Drag handle + number */}
            <div className="flex shrink-0 items-center gap-2 text-gray-400">
              <GripVertical className="hidden h-4 w-4 sm:block" aria-hidden />
              <span
                className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-black sm:h-8 sm:w-8"
                style={{ background: 'rgba(16,185,129,0.1)', color: '#047857' }}
              >
                {step.step_number}
              </span>
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h3 className="text-[15px] font-bold leading-snug text-[#1A1730] sm:truncate">
                  {step.title}
                </h3>
                {step.is_published ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">פורסם</span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">טיוטה</span>
                )}
              </div>
              {/* Content badges */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {step.video_provider && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                    <Video className="w-3 h-3" /> סרטון
                  </span>
                )}
                {step.quiz_questions.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">
                    <HelpCircle className="w-3 h-3" /> {step.quiz_questions.length} שאלות
                  </span>
                )}
                {step.game_items.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
                    <Gamepad2 className="w-3 h-3" /> {step.game_items.length} פריטי משחק
                  </span>
                )}
                {step.commitment && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-pink-50 text-pink-600">
                    <Heart className="w-3 h-3" /> התחייבות
                  </span>
                )}
                {step.researches.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-600">
                    <FileText className="w-3 h-3" /> {step.researches.length} מחקרים
                  </span>
                )}
                {attentionStopsCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-50 text-cyan-700">
                    <Brain className="w-3 h-3" /> {attentionStopsCount} עצירות קשב
                  </span>
                )}
              </div>
            </div>
            </div>

            {/* Actions — שורה נפרדת במובייל, אזורי מגע מוגדלים */}
            <div className="flex shrink-0 items-center justify-end gap-1 border-t border-slate-100 pt-3 sm:border-t-0 sm:pt-0">
              <button
                type="button"
                onClick={() => handleTogglePublish(step.id, step.is_published)}
                title={step.is_published ? 'הסתר' : 'פרסם'}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl transition-colors hover:bg-slate-100 active:bg-slate-200/80"
                style={{ color: step.is_published ? '#059669' : '#9ca3af' }}
              >
                {step.is_published ? <Eye className="h-[1.125rem] w-[1.125rem]" /> : <EyeOff className="h-[1.125rem] w-[1.125rem]" />}
              </button>
              <Link
                href={`/admin/steps/${step.id}`}
                title="ערוך"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-slate-100 active:bg-slate-200/80"
              >
                <Edit3 className="h-[1.125rem] w-[1.125rem]" />
              </Link>
              <button
                type="button"
                onClick={() => handleDelete(step.id)}
                title="מחק"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 active:bg-red-100/80"
              >
                <Trash2 className="h-[1.125rem] w-[1.125rem]" />
              </button>
            </div>
                </>
              );
            })()}
          </motion.div>
        ))}
      </div>

      {/* Empty state */}
      {steps.length === 0 && (
        <div className="text-center py-20">
          <CheckCircle2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-black mb-2" style={{ color: '#1A1730' }}>אין צעדים עדיין</h3>
          <p className="text-sm text-gray-500 mb-6">צרו את הצעד הראשון במסע</p>
          <Link
            href="/admin/steps/new"
            className="inline-flex min-h-11 w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-emerald-600 to-teal-500 px-6 py-3 font-bold text-white shadow-lg shadow-emerald-500/25 active:scale-[0.98] sm:w-auto"
          >
            <Plus className="h-4 w-4" /> צעד חדש
          </Link>
        </div>
      )}
    </div>
  );
}
