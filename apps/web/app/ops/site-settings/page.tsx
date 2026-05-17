import { SiteSettingsForm } from '@/components/admin/SiteSettingsForm';
import { AdminRegisterBackgroundPanel } from '@/components/admin/AdminRegisterBackgroundPanel';
import { AdminLoginBackgroundPanel } from '@/components/admin/AdminLoginBackgroundPanel';

export const dynamic = 'force-dynamic';

export default function OpsSiteSettingsPage() {
  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h1 className="mb-2 text-2xl font-black leading-tight text-slate-900 sm:text-3xl">הגדרות אתר</h1>
        <p className="text-sm leading-relaxed text-slate-600 sm:text-base">
          כתובת האפליקציה הציבורית שאליה מופנים משתמשים מהפאנל (למשל מסך התחברות). הערך נשמר במסד הנתונים ומעדכן
          את ההפניות מדומיין Ops.
        </p>
      </div>
      <SiteSettingsForm />
      <AdminRegisterBackgroundPanel />
      <AdminLoginBackgroundPanel />
    </div>
  );
}
