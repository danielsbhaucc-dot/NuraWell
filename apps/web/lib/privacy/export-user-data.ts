import {
  decProfileResult,
  decryptInteractionRow,
  decryptMeasurementRow,
  decryptTableRow,
  TABLE_ENC_TEXT,
  type EncTextTable,
} from '@/lib/crypto/pii-fields';
import { decryptDossierRow, decryptStringArray } from '@/lib/crypto/pii';
import type { SupabaseClient } from '@supabase/supabase-js';
import { LEGAL_POLICY_VERSION } from './constants';

type TableFetch = {
  key: string;
  table: string;
  limit?: number;
};

type Row = Record<string, unknown>;

/** מפענח שורה לפי הטבלה — כדי שהעותק שהמשתמש מקבל יהיה קריא (זכות עיון). */
function decryptForExport(table: string, row: Row, userId: string): Row {
  try {
    if (table in TABLE_ENC_TEXT) return decryptTableRow(table as EncTextTable, row, userId);
    if (table === 'ai_interactions') return decryptInteractionRow(row, userId);
    if (table === 'user_measurements') return decryptMeasurementRow(row, userId);
    if (table === 'user_memory_dossier') return decryptDossierRow(row, userId);
    if (table === 'user_mentorship_strategy' && 'medical_red_flags' in row) {
      return { ...row, medical_red_flags: decryptStringArray(row.medical_red_flags, userId) };
    }
  } catch {
    /* שורה שלא ניתן לפענח — מוחזרת כמו שהיא */
  }
  return row;
}

const USER_TABLES: TableFetch[] = [
  { key: 'notifications', table: 'notifications', limit: 500 },
  { key: 'journey_progress', table: 'journey_progress' },
  { key: 'chat_sessions', table: 'chat_sessions' },
  { key: 'user_memories', table: 'user_memories' },
  { key: 'user_insights', table: 'user_insights' },
  { key: 'chat_messages', table: 'ai_interactions', limit: 5000 },
  { key: 'measurements', table: 'user_measurements' },
  { key: 'memory_dossier', table: 'user_memory_dossier' },
  { key: 'mentorship_strategy', table: 'user_mentorship_strategy' },
  { key: 'almog_assignments', table: 'almog_assignments' },
  { key: 'almog_blockers', table: 'almog_blockers' },
  { key: 'almog_interventions', table: 'almog_interventions' },
  { key: 'scheduled_reminders', table: 'scheduled_reminders', limit: 1000 },
  { key: 'chat_periodic_summaries', table: 'chat_periodic_summaries' },
  { key: 'challenge_enrollments', table: 'challenge_enrollments' },
  { key: 'challenge_interviews', table: 'challenge_interview_sessions' },
  { key: 'task_events', table: 'task_events', limit: 2000 },
  { key: 'subscriptions', table: 'subscriptions' },
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
  return ((data ?? []) as Row[]).map((r) => decryptForExport(spec.table, r, userId));
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
    admin.from('profiles').select('*').eq('id', userId).maybeSingle().then(decProfileResult(userId)),
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
