import { AdminAlmogAvatarPanel } from '../../../components/admin/AdminAlmogAvatarPanel';

export const dynamic = 'force-dynamic';

export default function AdminAlmogPage() {
  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h1 className="mb-2 text-2xl font-black leading-tight text-slate-900 sm:text-3xl">הגדרות אלמוג</h1>
        <p className="text-sm leading-relaxed text-slate-600 sm:text-base">
          תמונת הפרופיל של אלמוג בצ&apos;אט ובממשק — לא משפיעה על משתמשי הקצה.
        </p>
      </div>

      <AdminAlmogAvatarPanel />
    </div>
  );
}
