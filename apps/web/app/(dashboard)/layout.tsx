import type { Viewport } from 'next';
import { createClient } from '../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { MobileHeader } from '../../components/shared/MobileHeader';
import { BottomNav } from '../../components/shared/BottomNav';
import { AIOverlaysClient } from '../../components/ai/AIOverlaysClient';
import { ProgressReportProvider } from '../../components/progress-report/ProgressReportProvider';
import { ActionHubProvider } from '../../components/action-hub/ActionHubProvider';
import { NotificationsProvider } from '../../components/notifications/NotificationsProvider';
import { DolevFirstLoginHost } from '../../components/onboarding/DolevFirstLoginHost';
import { AlmogFirstLoginHost } from '../../components/onboarding/AlmogFirstLoginHost';
import type { ProfileSummarySource } from '../../lib/onboarding/profile-summary-rows';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  interactiveWidget: 'resizes-content',
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await supabase
    .from('profiles')
    .select(
      `full_name, gender, main_goal, current_weight_kg, goal_weight_kg,
      weakest_time_of_day, main_obstacle, main_obstacle_detail,
      wake_up_time, sleep_time, meal_count, meal_schedule, dolev_welcome_seen_at, almog_welcome_seen_at,
      onboarding_completed`
    )
    .eq('id', user.id)
    .maybeSingle();

  const showDolevWelcome =
    Boolean(user.email_confirmed_at) &&
    profile?.onboarding_completed === true &&
    !profile?.dolev_welcome_seen_at;

  const showAlmogWelcome =
    Boolean(user.email_confirmed_at) &&
    profile?.onboarding_completed === true &&
    Boolean(profile?.dolev_welcome_seen_at) &&
    !profile?.almog_welcome_seen_at;

  const profileForDrawer: ProfileSummarySource = {
    full_name: profile?.full_name ?? null,
    gender: profile?.gender ?? null,
    main_goal: profile?.main_goal ?? null,
    current_weight_kg: profile?.current_weight_kg ?? null,
    goal_weight_kg: profile?.goal_weight_kg ?? null,
    weakest_time_of_day: profile?.weakest_time_of_day ?? null,
    main_obstacle: profile?.main_obstacle ?? null,
    main_obstacle_detail: profile?.main_obstacle_detail ?? null,
    wake_up_time: profile?.wake_up_time ?? null,
    sleep_time: profile?.sleep_time ?? null,
    meal_schedule: profile?.meal_schedule ?? null,
  };

  const fullName = (profile?.full_name ?? user.user_metadata?.full_name ?? '') as string;
  const firstName = fullName.trim().split(/\s+/)[0] || '';

  return (
    <NotificationsProvider userId={user.id} user={user}>
      <ProgressReportProvider
        userId={user.id}
        userMealProfile={{
          meal_count: typeof profile?.meal_count === 'number' ? profile.meal_count : null,
          meal_schedule: Array.isArray(profile?.meal_schedule) ? profile.meal_schedule : null,
        }}
      >
        <ActionHubProvider>
          <div className="min-h-screen bg-dashboard">
            <DolevFirstLoginHost show={Boolean(showDolevWelcome)} profile={profileForDrawer} />
            <AlmogFirstLoginHost show={Boolean(showAlmogWelcome)} profile={profileForDrawer} />
            <MobileHeader user={user} />
            <main id="main-content" className="pb-24 pt-16 min-h-screen page-enter" tabIndex={-1}>
              {children}
            </main>
            <BottomNav />
            <AIOverlaysClient userId={user.id} firstName={firstName} />
          </div>
        </ActionHubProvider>
      </ProgressReportProvider>
    </NotificationsProvider>
  );
}
