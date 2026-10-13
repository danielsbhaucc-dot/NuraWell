import { GuidesManager } from '@/components/admin/GuidesManager';
import { GuideRulesPanel } from '@/components/admin/GuideRulesPanel';

export const metadata = {
  title: 'מדריכים — ניהול',
};

export default function OpsGuidesPage() {
  return (
    <div className="space-y-6">
      <GuideRulesPanel />
      <GuidesManager />
    </div>
  );
}
