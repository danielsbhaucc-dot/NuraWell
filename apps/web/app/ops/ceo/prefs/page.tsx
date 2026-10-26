import { ensureOpsAdminServer } from '@/lib/auth/ensure-ops-admin-server';
import { GideonPrefsPanel } from '@/components/gideon/GideonPrefsPanel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'גדעון · הוראות קבועות' };

export default async function Page() {
  await ensureOpsAdminServer();
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-2xl font-bold">גדעון · הוראות קבועות ושקט</h1>
      <p className="text-sm text-ink-soft">כל מה שביקשת מגדעון לגבי מתי ומה לשלוח לך. נאכף בקוד בשכבת השליחה לטלגרם, לא רק בזיכרון שלו. תשובות ישירות כשאתה כותב לו תמיד נשלחות.</p>
      <GideonPrefsPanel />
    </div>
  );
}
