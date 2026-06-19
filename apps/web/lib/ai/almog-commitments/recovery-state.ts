import type { SupabaseClient } from '@supabase/supabase-js';
import { consecutiveJerusalemDoneDays } from '../../journey/recovery-streak';

export type RecoveryTrack = {
  journeyTaskId: string;
  stepId: string | null;
  originalAssignmentId: string | null;
  originalTitle: string;
  easedAssignmentId: string;
  easedTitle: string;
  blockerId: string | null;
  schedule: string | null;
  microDoneStreak?: number;
  lastDoneAt?: string | null;
};

export type UserRecoveryState = {
  tracks: RecoveryTrack[];
  hasActiveRecovery: boolean;
};

export async function fetchUserRecoveryState(
  admin: SupabaseClient,
  userId: string
): Promise<UserRecoveryState> {
  const { data: eased } = await admin
    .from('almog_assignments')
    .select('id, title, parent_assignment_id, related_step_id, metadata, history, last_done_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .eq('relation', 'eases');

  const tracks: RecoveryTrack[] = [];
  const parentIds = new Set<string>();

  for (const row of (eased ?? []) as Array<{
    id: string;
    title: string;
    parent_assignment_id: string | null;
    related_step_id: string | null;
    metadata: Record<string, unknown> | null;
    history: Array<{ at: string; action: string }> | null;
    last_done_at: string | null;
  }>) {
    const meta = row.metadata ?? {};
    const journeyTaskId = typeof meta.journey_task_id === 'string' ? meta.journey_task_id : '';
    if (!journeyTaskId) continue;
    if (row.parent_assignment_id) parentIds.add(row.parent_assignment_id);

    tracks.push({
      journeyTaskId,
      stepId: row.related_step_id,
      originalAssignmentId: row.parent_assignment_id,
      originalTitle: '',
      easedAssignmentId: row.id,
      easedTitle: row.title,
      blockerId: typeof meta.blocker_id === 'string' ? meta.blocker_id : null,
      schedule: typeof meta.journey_schedule === 'string' ? meta.journey_schedule : null,
      microDoneStreak: consecutiveJerusalemDoneDays(
        Array.isArray(row.history) ? row.history : []
      ),
      lastDoneAt: row.last_done_at,
    });
  }

  if (parentIds.size) {
    const { data: parents } = await admin
      .from('almog_assignments')
      .select('id, title')
      .eq('user_id', userId)
      .in('id', [...parentIds]);
    const titleById = new Map(
      ((parents ?? []) as { id: string; title: string }[]).map((p) => [p.id, p.title])
    );
    for (const t of tracks) {
      if (t.originalAssignmentId) {
        t.originalTitle = titleById.get(t.originalAssignmentId) ?? '';
      }
    }
  }

  return { tracks, hasActiveRecovery: tracks.length > 0 };
}

export function formatRecoveryStateForChat(state: UserRecoveryState): string | null {
  if (!state.hasActiveRecovery) return null;
  const lines = state.tracks.slice(0, 4).map((t) => {
    const orig = t.originalTitle || 'המשימה המקורית';
    const streak =
      typeof t.microDoneStreak === 'number' && t.microDoneStreak > 0
        ? ` · ${t.microDoneStreak} ימים טובים ברצף בצעד המקל`
        : '';
    return `- "${orig}" מוקפאת באמפתיה. עכשיו מתמקדים ב: "${t.easedTitle}"${streak}`;
  });
  return (
    `[תוכנית recovery פעילה]\n${lines.join('\n')}\n` +
    `אל תדחוף את המשימה המקורית. שאל איך הלך עם הצעד המותאם. אם קשה — הצע pivot קטן יותר.`
  );
}

/** מחליף כותרת משימה ב-checkpoint כשיש recovery פעיל */
export function resolveCheckpointTaskTitle(
  taskId: string,
  originalTitle: string,
  state: UserRecoveryState
): { title: string; inRecovery: boolean } {
  const track = state.tracks.find((t) => t.journeyTaskId === taskId);
  if (!track) return { title: originalTitle, inRecovery: false };
  return { title: track.easedTitle, inRecovery: true };
}

/** שליפה אצווה למשתמשים רבים — לשימוש ב-CRON habit-checkpoints */
export async function fetchRecoveryStatesForUsers(
  admin: SupabaseClient,
  userIds: string[]
): Promise<Map<string, UserRecoveryState>> {
  const out = new Map<string, UserRecoveryState>();
  if (!userIds.length) return out;

  const { data: eased } = await admin
    .from('almog_assignments')
    .select('user_id, id, title, parent_assignment_id, related_step_id, metadata')
    .in('user_id', userIds)
    .eq('status', 'active')
    .eq('relation', 'eases');

  const tracksByUser = new Map<string, RecoveryTrack[]>();
  const parentIds = new Set<string>();

  for (const row of (eased ?? []) as Array<{
    user_id: string;
    id: string;
    title: string;
    parent_assignment_id: string | null;
    related_step_id: string | null;
    metadata: Record<string, unknown> | null;
  }>) {
    const meta = row.metadata ?? {};
    const journeyTaskId = typeof meta.journey_task_id === 'string' ? meta.journey_task_id : '';
    if (!journeyTaskId) continue;
    if (row.parent_assignment_id) parentIds.add(row.parent_assignment_id);

    const track: RecoveryTrack = {
      journeyTaskId,
      stepId: row.related_step_id,
      originalAssignmentId: row.parent_assignment_id,
      originalTitle: '',
      easedAssignmentId: row.id,
      easedTitle: row.title,
      blockerId: typeof meta.blocker_id === 'string' ? meta.blocker_id : null,
      schedule: typeof meta.journey_schedule === 'string' ? meta.journey_schedule : null,
    };
    const list = tracksByUser.get(row.user_id) ?? [];
    list.push(track);
    tracksByUser.set(row.user_id, list);
  }

  const titleById = new Map<string, string>();
  if (parentIds.size) {
    const { data: parents } = await admin
      .from('almog_assignments')
      .select('id, title')
      .in('id', [...parentIds]);
    for (const p of (parents ?? []) as { id: string; title: string }[]) {
      titleById.set(p.id, p.title);
    }
  }

  for (const [userId, tracks] of tracksByUser) {
    for (const t of tracks) {
      if (t.originalAssignmentId) {
        t.originalTitle = titleById.get(t.originalAssignmentId) ?? '';
      }
    }
    out.set(userId, { tracks, hasActiveRecovery: tracks.length > 0 });
  }

  for (const uid of userIds) {
    if (!out.has(uid)) out.set(uid, { tracks: [], hasActiveRecovery: false });
  }

  return out;
}
