export type InboxSession = {
  id: string;
  status: 'open' | 'closed';
  summary: string | null;
  created_at: string;
  updated_at: string;
  preview_text: string | null;
  message_count: number;
};

export type InboxFolderId = 'all' | 'open' | 'today' | 'week' | 'summary';

export type InboxFolderChip = {
  id: InboxFolderId;
  label: string;
  count: number;
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
};

const MS_DAY = 24 * 60 * 60 * 1000;

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
  now = new Date()
): InboxFolderChip[] {
  const stats = buildInboxStats(sessions, now);
  const weekCount = sessions.filter((s) => isSessionThisWeek(s.updated_at, now)).length;

  return [
    { id: 'all', label: 'הכל', count: stats.total },
    { id: 'open', label: 'פעילות', count: stats.open },
    { id: 'today', label: 'היום', count: stats.today },
    { id: 'week', label: 'השבוע', count: weekCount },
    { id: 'summary', label: 'עם סיכום', count: stats.withSummary },
  ];
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
  }

  return filtered.sort(sortByRecent);
}

function assignSection(session: InboxSession, now: Date): string {
  if (session.status === 'open') return 'open';
  if (isSessionToday(session.updated_at, now)) return 'today';
  if (isSessionThisWeek(session.updated_at, now)) return 'week';
  if (session.summary?.trim()) return 'summary';
  return 'archive';
}

const SECTION_META: Array<{ id: string; label: string }> = [
  { id: 'open', label: 'פעילות עכשיו' },
  { id: 'today', label: 'היום' },
  { id: 'week', label: 'השבוע האחרון' },
  { id: 'summary', label: 'עם סיכום' },
  { id: 'archive', label: 'ארכיון' },
];

export function groupInboxSessions(
  sessions: InboxSession[],
  titleForSession: (session: InboxSession) => string,
  query = '',
  now = new Date()
): InboxSessionSection[] {
  const filtered = sessions.filter((session) =>
    sessionMatchesSearch(session, query, titleForSession(session))
  );

  const buckets = new Map<string, InboxSession[]>();
  for (const meta of SECTION_META) {
    buckets.set(meta.id, []);
  }

  for (const session of filtered) {
    const sectionId = assignSection(session, now);
    buckets.get(sectionId)?.push(session);
  }

  return SECTION_META.map((meta) => ({
    id: meta.id,
    label: meta.label,
    sessions: (buckets.get(meta.id) ?? []).sort(sortByRecent),
  })).filter((section) => section.sessions.length > 0);
}
