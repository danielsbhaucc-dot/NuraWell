'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Plus, Edit3, Eye, EyeOff, Trash2, GripVertical,
  Video, HelpCircle, Gamepad2, Heart, FileText, CheckCircle2
} from 'lucide-react';
import type { JourneyStep } from '../../lib/types/journey';

interface AdminStepsListProps {
  steps: JourneyStep[];
}

export function AdminStepsList({ steps: initialSteps }: AdminStepsListProps) {
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
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black" style={{ color: '#1A1730', fontFamily: "'Rubik','Heebo',sans-serif" }}>
            ניהול צעדי מסע
          </h1>
          <p className="text-sm text-gray-500 mt-1">{steps.length} צעדים</p>
        </div>
        <Link href="/admin/steps/new"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white transition-all hover:scale-105 active:scale-95"
          style={{ background: 'linear-gradient(135deg, #047857, #10b981)', boxShadow: '0 4px 12px rgba(16,185,129,0.3)' }}>
          <Plus className="w-4 h-4" />
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
            className="rounded-2xl p-4 flex items-center gap-4 transition-all hover:shadow-md"
            style={{
              background: 'rgba(255,255,255,0.95)',
              border: '1px solid rgba(0,0,0,0.06)',
              boxShadow: '0 2px 8px rgba(6,78,59,0.04)',
              opacity: isDeleting === step.id ? 0.5 : 1,
            }}
          >
            {/* Drag handle + number */}
            <div className="flex items-center gap-2 text-gray-400">
              <GripVertical className="w-4 h-4" />
              <span className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black"
                style={{ background: 'rgba(16,185,129,0.1)', color: '#047857' }}>
                {step.step_number}
              </span>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-bold text-[15px] truncate" style={{ color: '#1A1730' }}>
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
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button onClick={() => handleTogglePublish(step.id, step.is_published)}
                title={step.is_published ? 'הסתר' : 'פרסם'}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-gray-100"
                style={{ color: step.is_published ? '#059669' : '#9ca3af' }}>
                {step.is_published ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
              <Link href={`/admin/steps/${step.id}`}
                title="ערוך"
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-gray-100 text-gray-500">
                <Edit3 className="w-4 h-4" />
              </Link>
              <button onClick={() => handleDelete(step.id)}
                title="מחק"
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-red-50 text-gray-400 hover:text-red-500">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Empty state */}
      {steps.length === 0 && (
        <div className="text-center py-20">
          <CheckCircle2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-black mb-2" style={{ color: '#1A1730' }}>אין צעדים עדיין</h3>
          <p className="text-sm text-gray-500 mb-6">צרו את הצעד הראשון במסע</p>
          <Link href="/admin/steps/new"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #047857, #10b981)' }}>
            <Plus className="w-4 h-4" /> צעד חדש
          </Link>
        </div>
      )}
    </div>
  );
}
