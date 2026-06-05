'use client';

import { useState } from 'react';
import { UserCircle } from 'lucide-react';
import { MENTOR_IDS, MENTORS, type MentorId } from '@/lib/mentors/registry';
import { AdminMentorAvatarPanel } from '@/components/admin/AdminMentorAvatarPanel';
import { OpsPageHeader } from '@/components/admin/OpsPageHeader';

export default function OpsMentorsPage() {
  const [selected, setSelected] = useState<MentorId>('dolev');

  return (
    <div className="space-y-5 sm:space-y-6">
      <OpsPageHeader
        icon={UserCircle}
        eyebrow="אלמוג"
        title="הגדרות מנטורים"
        tone="violet"
        description="תמונות פרופיל ל-CDN (WebP, דחיסה בדפדפן, מחיקת קובץ ישן בהחלפה) — אלמוג במסע, דולב בהרשמה."
      />

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="בחירת מנטור">
        {MENTOR_IDS.map((id) => {
          const m = MENTORS[id];
          const active = selected === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSelected(id)}
              className={[
                'rounded-2xl px-4 py-2.5 text-sm font-bold transition-all border',
                active
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-900 shadow-md'
                  : 'border-slate-200 bg-white/60 text-slate-600 hover:border-emerald-300',
              ].join(' ')}
            >
              {m.name}
              <span className="block text-xs font-normal text-slate-500">{m.title}</span>
            </button>
          );
        })}
      </div>

      <AdminMentorAvatarPanel key={selected} mentorId={selected} />
    </div>
  );
}
