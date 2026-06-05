import type { Metadata } from 'next';
import { BookOpen } from 'lucide-react';
import { AlmogKnowledgeManager } from '@/components/admin/AlmogKnowledgeManager';
import { OpsPageHeader } from '@/components/admin/OpsPageHeader';

export const metadata: Metadata = {
  title: 'ניהול ידע של אלמוג',
  robots: { index: false, follow: false },
};

export default function SystemRagIngestPage() {
  return (
    <div className="space-y-5 sm:space-y-6">
      <OpsPageHeader
        icon={BookOpen}
        eyebrow="אלמוג"
        title="ניהול ידע של אלמוג"
        tone="sky"
        description="צפייה, חיפוש, עריכה והוספה של כל מה שאלמוג יודע — לפי שלב במסע או קורס. כל שמירה מעדכנת את האינדקס לשיחות."
      />
      <AlmogKnowledgeManager />
    </div>
  );
}
