import type { Metadata } from 'next';
import { DeclinedTasksPageClient } from '../../../../components/journey/DeclinedTasksPageClient';

export const metadata: Metadata = {
  title: 'משימות שלא לקחתי על עצמי',
  description: 'משימות שסומנו כלא מקובלות במסע — NuraWell',
};

export default function JourneyDeclinedTasksPage() {
  return (
    <div dir="rtl" className="min-w-0">
      <div className="px-4 pt-2 pb-3 border-b border-emerald-900/[0.06] bg-white/30 backdrop-blur-sm">
        <h1 className="text-xl font-black text-[#1A1730]" style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}>
          משימות שלא לקחתי על עצמי
        </h1>
        <p className="text-xs text-emerald-900/70 font-semibold mt-1">מעודכן מההתקדמות שלך במסע</p>
      </div>
      <DeclinedTasksPageClient />
    </div>
  );
}
