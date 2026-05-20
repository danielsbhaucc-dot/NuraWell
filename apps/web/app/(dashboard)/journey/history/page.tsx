import type { Metadata } from 'next';
import { TaskHistoryPageClient } from '../../../../components/journey/TaskHistoryPageClient';

export const metadata: Metadata = {
  title: 'היסטוריית משימות',
  description: 'כל ביצועי המשימות שלך — מאורגן לפי תאריך, כולל סלוטים ושעות. NuraWell',
};

export default function JourneyTaskHistoryPage() {
  return (
    <div dir="rtl" className="min-w-0">
      <div className="px-4 pt-2 pb-3 border-b border-emerald-900/[0.06] bg-white/30 backdrop-blur-sm">
        <h1
          className="text-xl font-black text-[#1A1730]"
          style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
        >
          היסטוריית משימות
        </h1>
        <p className="text-xs text-emerald-900/70 font-semibold mt-1">
          תיעוד יומי של כל הביצועים שלך, מקובץ לפי תאריך וסלוט. מתעדכן בזמן אמת.
        </p>
      </div>
      <TaskHistoryPageClient />
    </div>
  );
}
