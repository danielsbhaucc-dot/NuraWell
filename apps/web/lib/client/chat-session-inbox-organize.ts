import {
  CHAT_TOPIC_ORDER,
  countSessionsByTopic,
  detectSessionTopic,
  groupSessionsByTopic,
  type ChatTopicId,
} from './chat-session-topics';

export type InboxSession = {
  id: string;
  status: 'open' | 'closed';
  summary: string | null;
  created_at: string;
  updated_at: string;
  preview_text: string | null;
  message_count: number;
};

export type InboxTimeFolderId = 'all' | 'open' | 'today' | 'week' | 'summary';
export type InboxFolderId = InboxTimeFolderId | ChatTopicId;

export type InboxFolderChip = {
  id: InboxFolderId;
  label: string;
  count: number;
  kind: 'time' | 'topic';
  accent?: string;
};

export type InboxStats = {
  total: number;
  open: number;
  today: number;
  withSummary: number;
};

export type InboxSessionSection = {
  id: string;
  label: string;
  sessions: InboxSession[];
  accent?: string;
  kind: 'time' | 'topic';
};

const MS_DAY = 24 * 60 * 60 * 1000;

const TIME_FOLDER_IDS = new Set<InboxTimeFolderId>(['all', 'open', 'today', 'week', 'summary']);

export function isTimeFolder(folder: InboxFolderId): folder is InboxTimeFolderId {
  return TIME_FOLDER_IDS.has(folder as InboxTimeFolderId);
}

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function isSessionToday(updatedAt: string, now = new Date()): boolean {
  const ts = new Date(updatedAt).getTime();
  if (!Number.isFinite(ts)) return false;
  return startOfLocalDay(new Date(ts)) === startOfLocalDay(now);
}

export function isSessionThisWeek(updatedAt: string, now = new Date()): boolean {
  const ts = new Date(updatedAt).getTime();
  if (!Number.isFinite(ts)) return false;
  return now.getTime() - ts <= 7 * MS_DAY;
}

export function buildInboxStats(sessions: InboxSession[], now = new Date()): InboxStats {
  let open = 0;
  let today = 0;
  let withSummary = 0;

  for (const session of sessions) {
    if (session.status === 'open') open += 1;
    if (isSessionToday(session.updated_at, now)) today += 1;
    if (session.summary?.trim()) withSummary += 1;
  }

  return { total: sessions.length, open, today, withSummary };
}

export function buildInboxFolderChips(
  sessions: InboxSession[],
  titleForSession: (session: InboxSession) => string,
  now = new Date()
): InboxFolderChip[] {
  const stats = buildInboxStats(sessions, now);
  const weekCount = sessions.filter((s) => isSessionThisWeek(s.updated_at, now)).length;
  const topicCounts = countSessionsByTopic(sessions, titleForSession);

  const timeChips: InboxFolderChip[] = [
    { id: 'all', label: 'הכל', count: stats.total, kind: 'time' },
    { id: 'open', label: 'פעילות', count: stats.open, kind: 'time' },
    { id: 'today', label: 'היום', count: stats.today, kind: 'time' },
    { id: 'week', label: 'השבוע', count: weekCount, kind: 'time' },
    { id: 'summary', label: 'עם סיכום', count: stats.withSummary, kind: 'time' },
  ];

  const topicChips: InboxFolderChip[] = CHAT_TOPIC_ORDER.map((meta) => ({
    id: meta.id,
    label: meta.label,
    count: topicCounts.get(meta.id) ?? 0,
    kind: 'topic' as const,
    accent: meta.accent,
  })).filter((chip) => chip.count > 0);

  return [...timeChips, ...topicChips];
}

export function sessionMatchesSearch(
  session: InboxSession,
  query: string,
  title: string
): boolean {
  const q = query.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!q) return true;

  const haystack = [title, session.preview_text, session.summary]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(q);
}

function sortByRecent(a: InboxSession, b: InboxSession): number {
  return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
}

export function filterInboxSessions(
  sessions: InboxSession[],
  folder: InboxFolderId,
  query: string,
  titleForSession: (session: InboxSession) => string,
  now = new Date()
): InboxSession[] {
  let filtered = sessions.filter((session) =>
    sessionMatchesSearch(session, query, titleForSession(session))
  );

  if (folder === 'open') {
    filtered = filtered.filter((s) => s.status === 'open');
  } else if (folder === 'today') {
    filtered = filtered.filter((s) => isSessionToday(s.updated_at, now));
  } else if (folder === 'week') {
    filtered = filtered.filter((s) => isSessionThisWeek(s.updated_at, now));
  } else if (folder === 'summary') {
    filtered = filtered.filter((s) => Boolean(s.summary?.trim()));
  } else if (!isTimeFolder(folder)) {
    filtered = filtered.filter(
      (s) => detectSessionTopic(s, titleForSession(s)) === folder
    );
  }

  return filtered.sort(sortByRecent);
}

export function groupInboxSessions(
  sessions: InboxSession[],
  titleForSession: (session: InboxSession) => string,
  query = '',
  now = new Date()
): InboxSessionSection[] {
  const filtered = sessions.filter((session) =>
    sessionMatchesSearch(session, query, titleForSession(session))
  );

  const openSessions = filtered.filter((s) => s.status === 'open').sort(sortByRecent);
  const topicGroups = groupSessionsByTopic(filtered, titleForSession);

  const sections: InboxSessionSection[] = [];

  if (openSessions.length > 0) {
    sections.push({
      id: 'open',
      label: 'פעילות עכשיו',
      sessions: openSessions,
      kind: 'time',
      accent: '#22c55e',
    });
  }

  for (const group of topicGroups) {
    sections.push({
      id: group.id,
      label: group.label,
      sessions: group.sessions,
      kind: 'topic',
      accent: group.accent,
    });
  }

  return sections;
}
