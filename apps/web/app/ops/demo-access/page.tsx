import { FlaskConical } from 'lucide-react';
import { OpsPageHeader } from '@/components/admin/OpsPageHeader';
import { AdminDemoAccessPanel } from '@/components/admin/AdminDemoAccessPanel';

export const dynamic = 'force-dynamic';

export default function OpsDemoAccessPage() {
  return (
    <div className="space-y-5 sm:space-y-6">
      <OpsPageHeader
        icon={FlaskConical}
        eyebrow="גישה זמנית"
        title="קישורי דמו"
        tone="amber"
        description="פתחו קישור לאנשי מקצוע ומפתחים לצפייה במערכת עם משתמש דמו מוגדר מראש — בלי יצירת חשבון ובלי הרשאות מנהל. אפשר סיסמה זמנית, תוקף, ותמונת רקע למסך הכניסה."
      />
      <AdminDemoAccessPanel />
    </div>
  );
}
