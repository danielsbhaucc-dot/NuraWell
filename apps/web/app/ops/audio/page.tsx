import { Music } from 'lucide-react';
import { AdminAudioPlaylistsClient } from '@/components/admin/AdminAudioPlaylistsClient';
import { OpsPageHeader } from '@/components/admin/OpsPageHeader';

export const dynamic = 'force-dynamic';

export default function OpsAudioPage() {
  return (
    <div className="space-y-5 sm:space-y-6">
      <OpsPageHeader
        icon={Music}
        eyebrow="ניהול מסע"
        title="מוזיקת רקע"
        tone="violet"
        description="ניהול פלייליסטים של מוזיקת רקע לשיעורים. העלאת אודיו עוברת דחיסה בדפדפן (MP3) ונשמרת ל-CDN (R2 דלי AUDIO). כל רצועה נושאת קרדיט (Pixabay) שמוצג בשיעור."
      />
      <AdminAudioPlaylistsClient />
    </div>
  );
}
