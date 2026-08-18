import type { SupabaseClient } from '@supabase/supabase-js';

export type TranscriptAccessGrant = {
  kind: 'global' | 'session';
  request_id?: string;
  session_id?: string | null;
  session_title?: string | null;
  label: string;
  access_until: string | null;
  approved_at: string | null;
  reason?: string | null;
  exposed: string[];
};

const SESSION_EXPOSED = ['תמליל השיחה המלא', 'כותרת השיחה', 'תאריכי ההודעות'];
const GLOBAL_EXPOSED = [
  'תמלילי כל השיחות',
  'כותרות וסיכומי שיחות',
  'מטא-דאטה (תאריכים, מספר הודעות)',
];

export async function fetchUserTranscriptAccessGrants(
  client: SupabaseClient,
  userId: string,
  globalGranted: boolean,
  globalGrantedAt: string | null,
): Promise<TranscriptAccessGrant[]> {
  const grants: TranscriptAccessGrant[] = [];

  if (globalGranted) {
    grants.push({
      kind: 'global',
      label: 'כל תמלילי השיחות (הסכמה גלובלית)',
      access_until: null,
      approved_at: globalGrantedAt,
      exposed: GLOBAL_EXPOSED,
    });
  }

  const now = new Date().toISOString();
  const { data: approved } = await client
    .from('chat_transcript_access_requests')
    .select('id, session_id, reason, resolved_at, access_until')
    .eq('user_id', userId)
    .eq('status', 'approved')
    .gt('access_until', now)
    .order('resolved_at', { ascending: false });

  const sessionIds = (approved ?? [])
    .map((r) => r.session_id as string | null)
    .filter(Boolean) as string[];

  let titlesBySession: Record<string, string> = {};
  if (sessionIds.length > 0) {
    const { data: sessions } = await client
      .from('chat_sessions')
      .select('id, title')
      .in('id', sessionIds);
    for (const s of sessions ?? []) {
      if (s.id && s.title) titlesBySession[s.id as string] = s.title as string;
    }
  }

  for (const row of approved ?? []) {
    const sid = row.session_id as string | null;
    grants.push({
      kind: 'session',
      request_id: row.id as string,
      session_id: sid,
      session_title: sid ? titlesBySession[sid] ?? null : null,
      label: sid
        ? `שיחה: ${titlesBySession[sid] ?? 'ללא כותרת'}`
        : 'תמליל שיחה (בקשה ישירה)',
      access_until: row.access_until as string | null,
      approved_at: row.resolved_at as string | null,
      reason: row.reason as string,
      exposed: SESSION_EXPOSED,
    });
  }

  return grants;
}
