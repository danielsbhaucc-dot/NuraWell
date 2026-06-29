'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Brain, Sparkles } from 'lucide-react';
import type { ChallengePatternInsight } from '@/lib/challenge/insights';

export function ChallengeInsightsCard() {
  const [insights, setInsights] = useState<ChallengePatternInsight[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v1/challenge/insights', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setInsights(d.insights ?? []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (!insights.length) return null;

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center gap-2">
        <Brain className="h-4 w-4 text-violet-300" />
        <h2 className="text-sm font-bold text-white/60">דפוסים שאלמוג זיהה</h2>
      </div>
      <ul className="space-y-2">
        {insights.map((item, i) => (
          <motion.li
            key={item.id}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-xl border border-violet-400/20 bg-violet-500/10 px-4 py-3"
          >
            <div className="flex items-start gap-2">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
              <div>
                <p className="text-sm font-semibold text-violet-100">{item.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-white/50">{item.description}</p>
              </div>
            </div>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}
