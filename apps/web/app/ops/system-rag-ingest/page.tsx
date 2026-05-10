import type { Metadata } from 'next';
import { BookOpen } from 'lucide-react';
import { SystemKnowledgeIngestForm } from '@/components/admin/SystemKnowledgeIngestForm';

export const metadata: Metadata = {
  title: 'הזנת ידע RAG',
  robots: { index: false, follow: false },
};

export default function SystemRagIngestPage() {
  return (
    <div className="relative mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-600/25">
          <BookOpen size={24} aria-hidden />
        </div>
        <div>
          <h1 className="font-display text-2xl font-black text-slate-900 sm:text-3xl">הזנת ידע למערכת (RAG)</h1>
          <p className="mt-1 text-[15px] text-slate-600">
            פיצול דטרמיניסטי, embedding ב־OpenRouter, ואחסון ב־Upstash Vector (namespace{' '}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm">system-knowledge</code>).
          </p>
        </div>
      </header>

      <SystemKnowledgeIngestForm />
    </div>
  );
}
