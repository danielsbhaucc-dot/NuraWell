import type { Metadata } from 'next';
import { FlaskConical } from 'lucide-react';
import { OpsPageHeader } from '@/components/admin/OpsPageHeader';
import { NotifyModelLab } from '@/components/admin/NotifyModelLab';

export const metadata: Metadata = {
  title: 'מעבדת מודלים להתראות',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function NotifyModelLabPage() {
  return (
    <div className="space-y-5 sm:space-y-6">
      <OpsPageHeader
        icon={FlaskConical}
        eyebrow="אלמוג · התראות"
        title="מעבדת מודלים להתראות"
        tone="violet"
        description="בודק את מודל ניסוח ההתראות של אלמוג מול מספר מודלים דרך OpenRouter (ניתוב מועדף ל-DeepInfra). שליחה בלתי מוגבלת לבדיקות — בלי לגעת בסלוט החי ובלי לחסום אותו."
      />
      <NotifyModelLab />
    </div>
  );
}
