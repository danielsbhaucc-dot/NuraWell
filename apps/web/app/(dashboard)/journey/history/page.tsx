import type { Metadata } from 'next';
import { History } from 'lucide-react';
import { TaskHistoryPageClient } from '../../../../components/journey/TaskHistoryPageClient';

export const metadata: Metadata = {
  title: 'היסטוריית משימות',
  description: 'כל ביצועי המשימות שלך — מאורגן לפי תאריך, כולל סלוטים ושעות. NuraWell',
};

export default function JourneyTaskHistoryPage() {
  return (
    <div dir="rtl" className="min-w-0">
      <div className="px-4 pt-3 pb-3 border-b border-emerald-900/[0.06] bg-white/30 backdrop-blur-sm">
        <div className="flex items-start gap-3">
          <div
            className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-emerald-700"
            style={{
              background: 'linear-gradient(145deg, rgba(236,253,245,0.95), rgba(167,243,208,0.55))',
              border: '1px solid rgba(16,185,129,0.28)',
            }}
            aria-hidden
          >
            <History className="h-5 w-5" strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1 text-right">
            <h1
              className="text-xl font-black text-[#1A1730] leading-snug break-words"
              style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
            >
              היסטוריית משימות
            </h1>
            <p className="text-xs text-emerald-900/70 font-semibold mt-1 leading-relaxed break-words">
              תיעוד יומי של כל הביצועים שלך, מקובץ לפי תאריך וסלוט. מתעדכן בזמן אמת.
            </p>
          </div>
        </div>
      </div>
      <TaskHistoryPageClient />
    </div>
  );
}
