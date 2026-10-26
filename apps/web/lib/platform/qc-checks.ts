import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { grade, type QcCheck } from '@platform/qc';

/** NuraWell's QC checks. Every query filters by product_id (000192), so another product registers its own list. */
export function nurawellQcChecks(db: SupabaseClient): QcCheck[] {
  const since = (ms: number) => new Date(ms).toISOString();
  const count = async (table: string, product: string, sinceMs: number, f?: (q: any) => any) => {
    let q = db.from(table).select('*', { count: 'exact', head: true }).eq('product_id', product).gte('created_at', since(sinceMs));
    if (f) q = f(q);
    const { count: n, error } = await q;
    if (error) throw new Error(error.message);
    return n ?? 0;
  };
  return [
    {
      id: 'server-errors',
      label: 'שגיאות שרת',
      description: 'שגיאות בחומרת error ומעלה בייצור. עלייה חדה מעידה על תקלה בקוד או בספק.',
      run: async (c) => {
        const n = await count('error_events', c.productId, c.sinceMs, (q) => q.in('severity', ['error', 'fatal']).eq('environment', 'production'));
        return { status: grade(n, 10, 50), value: n, unit: 'שגיאות', detail: n === 0 ? 'אין שגיאות.' : `${n} שגיאות בתקופה.` };
      },
    },
    {
      id: 'delivery-failures',
      label: 'כשלי שליחה',
      description: 'אחוז ההודעות (מייל, טלגרם, SMS) שלא נמסרו לספק.',
      run: async (c) => {
        const total = await count('delivery_log', c.productId, c.sinceMs);
        const failed = await count('delivery_log', c.productId, c.sinceMs, (q) => q.eq('ok', false));
        const pct = total ? Math.round((failed / total) * 100) : 0;
        return { status: total < 5 ? (failed ? 'warn' : 'ok') : grade(pct, 5, 20), value: pct, unit: '%', detail: `${failed} מתוך ${total} נכשלו.` };
      },
    },
    {
      id: 'notify-quality',
      label: 'תיקוני ניסוח בהתראות',
      description: 'כמה התראות נתפסו ותוקנו אוטומטית לפני שליחה. עלייה מעידה על תבנית שהשתבשה.',
      run: async (c) => {
        const n = await count('notify_quality_events', c.productId, c.sinceMs);
        return { status: grade(n, 20, 100), value: n, unit: 'תיקונים', detail: `${n} תיקונים בתקופה.` };
      },
    },
    {
      id: 'security-events',
      label: 'אירועי אבטחה',
      description: 'אירועי אבטחה שנרשמו (כניסות חשודות, נעילות, שבירת זכוכית).',
      run: async (c) => {
        const n = await count('ops_security_events', c.productId, c.sinceMs);
        return { status: grade(n, 5, 25), value: n, unit: 'אירועים', detail: `${n} אירועים בתקופה.` };
      },
    },
  ];
}

/** Registry: product → its checks. A product without an entry gets an empty, honest screen. */
export function qcChecksFor(db: SupabaseClient, productId: string): QcCheck[] {
  return productId === 'nurawell' ? nurawellQcChecks(db) : [];
}
