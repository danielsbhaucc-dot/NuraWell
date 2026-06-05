import { Globe } from 'lucide-react';
import { SiteSettingsTabs } from '@/components/admin/SiteSettingsTabs';
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
        description="כתובת האפליקציה הציבורית, רקעי התחברות/הרשמה ומסך ה-Coming Soon — מחולקים לטאבים. הערכים נשמרים במסד הנתונים."
      />
      <SiteSettingsTabs />
    </div>
  );
}
