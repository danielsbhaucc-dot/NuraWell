import { Globe } from 'lucide-react';
import { SiteSettingsForm } from '@/components/admin/SiteSettingsForm';
import { AdminRegisterBackgroundPanel } from '@/components/admin/AdminRegisterBackgroundPanel';
import { AdminLoginBackgroundPanel } from '@/components/admin/AdminLoginBackgroundPanel';
import { AdminComingSoonPanel } from '@/components/admin/AdminComingSoonPanel';
import { OpsPageHeader } from '@/components/admin/OpsPageHeader';

export const dynamic = 'force-dynamic';

export default function OpsSiteSettingsPage() {
  return (
    <div className="space-y-5 sm:space-y-6">
      <OpsPageHeader
        icon={Globe}
        eyebrow="תצורה"
        title="הגדרות אתר"
        tone="sky"
        description="כתובת האפליקציה הציבורית שאליה מופנים משתמשים מהפאנל, רקעי התחברות/הרשמה ומסך ה-Coming Soon. הערכים נשמרים במסד הנתונים."
      />
      <SiteSettingsForm />
      <AdminComingSoonPanel />
      <AdminRegisterBackgroundPanel />
      <AdminLoginBackgroundPanel />
    </div>
  );
}
