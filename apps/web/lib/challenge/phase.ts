import type {
  ChallengeDemoScenario,
  ChallengeEnrollment,
  ChallengePhase,
} from './types';
import { currentChallengeDayIndex, jerusalemDateKeyFromDate } from './start-date';

export function resolveChallengePhase(
  enrollment: ChallengeEnrollment | null,
  now: Date = new Date(),
): ChallengePhase {
  if (!enrollment) return 'none';
  if (enrollment.status === 'dropped') return 'none';

  if (enrollment.is_demo && enrollment.demo_scenario) {
    return demoScenarioToPhase(enrollment.demo_scenario, enrollment);
  }

  const todayKey = jerusalemDateKeyFromDate(now);
  if (todayKey < enrollment.challenge_start_date) return 'waiting';
  if (todayKey > enrollment.challenge_end_date) {
    if (!enrollment.wrap_up_seen_at) return 'wrap_up';
    return 'completed';
  }

  const dayIndex = currentChallengeDayIndex(
    enrollment.challenge_start_date,
    enrollment.challenge_end_date,
    now,
    enrollment.demo_simulated_day,
  );
  if (dayIndex <= 0) return 'waiting';

  if (!enrollment.intro_completed_at) return 'intro';
  if (!enrollment.eating_window) return 'eating_window_setup';
  if (!enrollment.interview_completed_at) return 'interview';
  return 'active';
}

function demoScenarioToPhase(
  scenario: ChallengeDemoScenario,
  enrollment: ChallengeEnrollment,
): ChallengePhase {
  switch (scenario) {
    case 'waiting':
      return 'waiting';
    case 'intro':
      if (!enrollment.intro_completed_at) return 'intro';
      if (!enrollment.eating_window) return 'eating_window_setup';
      if (!enrollment.interview_completed_at) return 'interview';
      return 'active';
    case 'active':
      return 'active';
    case 'wrap_up':
      return 'wrap_up';
    default:
      return 'none';
  }
}

export function challengeRouteForPhase(phase: ChallengePhase): string {
  switch (phase) {
    case 'waiting':
      return '/challenge';
    case 'intro':
      return '/challenge/intro';
    case 'eating_window_setup':
      return '/challenge/eating-window';
    case 'interview':
      return '/challenge/interview';
    case 'active':
      return '/challenge/dashboard';
    case 'wrap_up':
      return '/challenge/complete';
    case 'completed':
      return '/home';
    default:
      return '/home';
  }
}

export function isChallengeLockedPath(pathname: string): boolean {
  if (pathname.startsWith('/challenge')) return false;
  if (pathname.startsWith('/api/v1/challenge')) return false;
  if (pathname.startsWith('/login')) return false;
  if (pathname.startsWith('/auth/')) return false;
  if (pathname.startsWith('/ops')) return false;
  return true;
}

export function challengeAllowedPaths(phase: ChallengePhase): string[] {
  const apiExtras = ['/api/v1/notifications', '/api/v1/push/subscribe'];
  const base = ['/challenge', '/api/v1/challenge', ...apiExtras];
  switch (phase) {
    case 'waiting':
      return [...base];
    case 'intro':
      return [...base, '/challenge/intro'];
    case 'eating_window_setup':
      return [...base, '/challenge/intro', '/challenge/eating-window'];
    case 'interview':
      return [...base, '/challenge/intro', '/challenge/eating-window', '/challenge/interview'];
    case 'active':
      return [
        ...base,
        '/challenge/intro',
        '/challenge/eating-window',
        '/challenge/interview',
        '/challenge/dashboard',
      ];
    case 'wrap_up':
      return [...base, '/challenge/complete'];
    case 'completed':
      return ['/home', '/api/v1/challenge', ...apiExtras];
    default:
      return [];
  }
}

export function isPathAllowedInChallengePhase(pathname: string, phase: ChallengePhase): boolean {
  if (phase === 'none') return true;
  const allowed = challengeAllowedPaths(phase);
  return allowed.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
