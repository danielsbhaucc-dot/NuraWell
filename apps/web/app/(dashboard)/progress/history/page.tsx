import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '../../../../lib/supabase/server';
import { buildTaskHistoryReport } from '../../../../lib/journey/build-task-history';
import { TaskHistoryClient } from '../../../../components/progress/TaskHistoryClient';
import { firstNameFrom, type ProfileGender } from '../../../../lib/profile/personalized-copy';

export const metadata: Metadata = {
  title: 'היסטוריית משימות',
  description:
    'היסטוריה מפורטת של משימות שקיבלת על עצמך — מתי קיבלת, מתי ביצעת בפעם הראשונה, רצפים, הצלחות וימים שהוחמצו.',
};

/**
 * /progress/history — היסטוריית משימות מפורטת ומסודרת.
 *
 * מציג: לכל משימה מקובלת — accepted_at / first_execution_at / last_execution_at,
 * ימי הצלחה ופספוס, רצף נוכחי ושיא, וביצועים מפורטים לפי יום + סלוט + שעה.
 *
 * מובייל-פרסט (Tailwind), שולף ראשונית ב-SSR (חודש אחרון) ומאפשר החלפה ל-UI
 * (יום / שבוע / חודש / שנה / מותאם) דרך /api/v1/task-history.
 */
export default async function TaskHistoryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, gender')
    .eq('id', user.id)
    .maybeSingle();

  const firstName = firstNameFrom(profile?.full_name ?? null);
  const gender = (profile?.gender ?? null) as ProfileGender;

  const initialReport = await buildTaskHistoryReport(supabase, user.id, { range: 'month' });

  return (
    <TaskHistoryClient
      userId={user.id}
      firstName={firstName}
      gender={gender}
      initialReport={initialReport}
    />
  );
}
