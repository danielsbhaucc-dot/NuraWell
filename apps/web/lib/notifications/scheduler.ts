import 'server-only';

/**
 * 🗓️ Unified notification scheduler — the ONE entry point for every automatic notification.
 *
 * Cron routes are thin triggers: `runNotificationJob(job, method, request)`.
 * Each job module (lib/notifications/jobs/*) keeps its own selection logic, prompts and content
 * (unchanged — quality parity), and all of them share:
 *   - decision:  evaluateNotifyGate (recipient/test opt-in, notification_prefs, inactivity fade)
 *                + gateAlmogUserFacingTouch (open-task 3/day, touch fatigue)
 *   - delivery:  insertNotification (single write/log into `notifications`, DB dedupe)
 *   - push:      afterAlmogInAppNotification (honors notification_prefs.push)
 *
 * Notification types per job:
 *   habit-checkpoints     → fixed 08/13/20 task reminders (skipped for users with personal times), task follow-ups
 *   onboarding-check-ins  → personal check-ins (ai_check_in_times), commitment reminders drain, journey/companion
 *                           nudges, program orchestrator proposals, 14-day challenge
 *   passive-presence      → churn-prevention passive presence
 *   master                → cron_ops celebrations, churn nudges, life-context touches
 *   guardian              → pre-lapse guardian touches (QStash-triggered)
 */
export const NOTIFICATION_JOBS = {
  'habit-checkpoints': () => import('./jobs/habit-checkpoints'),
  'onboarding-check-ins': () => import('./jobs/onboarding-check-ins'),
  'passive-presence': () => import('./jobs/passive-presence'),
  master: () => import('./jobs/master'),
  guardian: () => import('./jobs/guardian'),
} as const;

export type NotificationJob = keyof typeof NOTIFICATION_JOBS;

type JobModule = {
  handlePost: (request: Request) => Promise<Response>;
  handleGet: (request: Request) => Promise<Response>;
};

export async function runNotificationJob(
  job: NotificationJob,
  method: 'GET' | 'POST',
  request: Request
): Promise<Response> {
  const mod = (await NOTIFICATION_JOBS[job]()) as unknown as JobModule;
  const started = Date.now();
  const res = method === 'POST' ? await mod.handlePost(request) : await mod.handleGet(request);
  if (method === 'POST') {
    // eslint-disable-next-line no-console
    console.log('[notify-scheduler]', JSON.stringify({ job, status: res.status, ms: Date.now() - started }));
  }
  return res;
}
