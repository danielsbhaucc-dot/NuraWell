import { AdminAudioPlaylistsClient } from '@/components/admin/AdminAudioPlaylistsClient';

export const dynamic = 'force-dynamic';

export default function OpsAudioPage() {
  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h1 className="mb-2 text-2xl font-black text-slate-900 sm:text-3xl">מוזיקת רקע</h1>
        <p className="text-sm text-slate-600 sm:text-base">
          ניהול פלייליסטים של מוזיקת רקע לשיעורים. העלאת אודיו עוברת דחיסה בדפדפן (MP3) ונשמרת ל-CDN
          (R2 דלי AUDIO). כל רצועה נושאת קרדיט (Pixabay) שמוצג בשיעור.
        </p>
      </div>
      <AdminAudioPlaylistsClient />
    </div>
  );
}
