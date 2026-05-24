import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '../../../../lib/supabase/server';
import { AlmogNudgeSettingsClient } from '../../../../components/settings/AlmogNudgeSettingsClient';
import { coachingStyleFromContext, type AlmogCoachingStyle } from '../../../../lib/ai/almog-coaching-style';
import type { AiUserContext } from '../../../../lib/ai/memory';

export const metadata: Metadata = {
  title: 'התראות מאלמוג',
  description: 'בחרו איך אלמוג נוגע בכם מחוץ לצ׳אט — תזכורות עדינות ועדכוני משקל.',
};

export default async function AlmogNudgeSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row } = await (supabase as any)
    .from('profiles')
    .select('ai_context')
    .eq('id', user.id)
    .single();

  const ctx = (row?.ai_context ?? null) as AiUserContext | null;
  const avoidPush = ctx?.avoid_push === true;
  const weightReminders = ctx?.skip_weight_check_ins !== true;
  const coachingStyle: AlmogCoachingStyle = coachingStyleFromContext(ctx);
  const workArrival =
    typeof ctx?.work_arrival_time === 'string' ? ctx.work_arrival_time.slice(0, 5) : '';

  return (
    <AlmogNudgeSettingsClient
      initialAvoidPush={avoidPush}
      initialWeightReminders={weightReminders}
      initialCoachingStyle={coachingStyle}
      initialWorkArrivalTime={workArrival}
    />
  );
}
