import type { SupabaseClient } from '@supabase/supabase-js';
import { LEGAL_POLICY_VERSION } from './constants';

type TableFetch = {
  key: string;
  table: string;
  limit?: number;
};

const USER_TABLES: TableFetch[] = [
  { key: 'notifications', table: 'notifications', limit: 500 },
  { key: 'journey_progress', table: 'journey_progress' },
  { key: 'chat_sessions', table: 'chat_sessions' },
  { key: 'user_memories', table: 'user_memories' },
  { key: 'user_insights', table: 'user_insights' },
  { key: 'almog_commitments', table: 'almog_commitments' },
  { key: 'guardian_sos_events', table: 'guardian_sos_events' },
  { key: 'enrollments', table: 'enrollments' },
  { key: 'lesson_progress', table: 'lesson_progress' },
  { key: 'periodic_summaries', table: 'periodic_summaries' },
  { key: 'video_view_events', table: 'video_view_events', limit: 1000 },
  { key: 'task_executions', table: 'journey_task_executions', limit: 2000 },
];

async function fetchUserRows(
  admin: SupabaseClient,
  userId: string,
  spec: TableFetch
): Promise<unknown[]> {
  let query = admin.from(spec.table).select('*').eq('user_id', userId);
  if (spec.limit) query = query.limit(spec.limit);
  const { data, error } = await query;
  if (error) {
    console.warn(`[export-user-data] skip ${spec.table}:`, error.message);
    return [];
  }
  return data ?? [];
}

export type UserDataExport = {
  exported_at: string;
  policy_version: string;
  user_id: string;
  email: string | null;
  profile: Record<string, unknown> | null;
  consents: unknown[];
  data: Record<string, unknown[]>;
};

export async function buildUserDataExport(
  admin: SupabaseClient,
  userId: string
): Promise<UserDataExport> {
  const [{ data: profile }, { data: consents }, authUser] = await Promise.all([
    admin.from('profiles').select('*').eq('id', userId).maybeSingle(),
    admin.from('user_consents').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    admin.auth.admin.getUserById(userId),
  ]);

  const data: Record<string, unknown[]> = {};
  for (const spec of USER_TABLES) {
    data[spec.key] = await fetchUserRows(admin, userId, spec);
  }

  return {
    exported_at: new Date().toISOString(),
    policy_version: LEGAL_POLICY_VERSION,
    user_id: userId,
    email: authUser.data.user?.email ?? null,
    profile: profile as Record<string, unknown> | null,
    consents: consents ?? [],
    data,
  };
}
