/**
 * Server page: /summaries
 *
 * הצגת מסך הסיכומים התקופתיים של המשתמש (Memory Pyramid).
 *
 * אחריות השרת:
 *   • אימות session + redirect ל-/login.
 *   • שליפת כל הסיכומים של המשתמש מ-`periodic_summaries` (RLS — רק שלו).
 *   • חישוב "מפתחות התקופה הנוכחית" (Israel) שיועברו לכפתורי ה-on-demand.
 *
 * אחריות הלקוח (`SummariesPageClient`):
 *   • Toasts, loading state, רענון אחרי הצלחה (router.refresh()).
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '../../../lib/supabase/server';
import { israelDateKey } from '../../../lib/ai/onboarding-check-in-time';
import {
  buildAnnualKey,
  buildDailyKey,
  buildMonthlyKey,
  buildQuarterlyKey,
  buildSemiAnnualKey,
  buildWeeklyKey,
  fromDateKey,
  type SummaryType,
} from '../../../lib/notifications/summaries';
import { SummariesPageClient } from '../../../components/summaries/SummariesPageClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'הסיכומים שלי',
  description: 'סיכומים תקופתיים של המסע שלך ב-NuraWell — יומי, שבועי, חודשי ועד שנתי.',
};

export interface PeriodicSummaryRow {
  id: string;
  type: SummaryType;
  period_key: string;
  metrics: Record<string, unknown>;
  ai_insight: string;
  ai_model: string;
  created_at: string;
}

export default async function SummariesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawSummaries } = await (supabase as any)
    .from('periodic_summaries')
    .select('id, type, period_key, metrics, ai_insight, ai_model, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100);

  const summaries = (rawSummaries ?? []) as PeriodicSummaryRow[];

  // המפתחות הנוכחיים — נשלחים לכפתורי "צור עכשיו".
  // משתמשים ב-Date של ירושלים: לוקחים את date_key היום (YYYY-MM-DD בלוח IL),
  // הופכים ל-Date ב-UTC, וכל ה-builder-ים עובדים על Date זה.
  const todayKey = israelDateKey();
  const todayDate = fromDateKey(todayKey);

  const currentPeriods: Record<SummaryType, string> = {
    daily: buildDailyKey(todayDate),
    weekly: buildWeeklyKey(todayDate),
    monthly: buildMonthlyKey(todayDate),
    quarterly: buildQuarterlyKey(todayDate),
    semi_annual: buildSemiAnnualKey(todayDate),
    annual: buildAnnualKey(todayDate),
  };

  return (
    <SummariesPageClient
      userId={user.id}
      summaries={summaries}
      currentPeriods={currentPeriods}
    />
  );
}
