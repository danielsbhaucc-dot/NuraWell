import type { InboxSession } from './chat-session-inbox-organize';

export type ChatTopicId =
  | 'habits'
  | 'emotions'
  | 'nutrition'
  | 'sleep'
  | 'journey'
  | 'general';

export type ChatTopicMeta = {
  id: ChatTopicId;
  label: string;
  accent: string;
};

export const CHAT_TOPIC_ORDER: ChatTopicMeta[] = [
  { id: 'habits', label: 'הרגלים וצעדים', accent: '#0ea5e9' },
  { id: 'emotions', label: 'רגש ותמיכה', accent: '#f43f5e' },
  { id: 'nutrition', label: 'אכילה ותזונה', accent: '#f97316' },
  { id: 'sleep', label: 'שינה ומנוחה', accent: '#8b5cf6' },
  { id: 'journey', label: 'מסע ולימוד', accent: '#10b981' },
  { id: 'general', label: 'שיחות כלליות', accent: '#64748b' },
];

const TOPIC_PATTERNS: Array<{ id: ChatTopicId; pattern: RegExp }> = [
  {
    id: 'journey',
    pattern:
      /(שיעור|מסע|מסלול|למדנו|לימוד|צעד במסע|מנטור|מדריך|הדרכה|תוכנית|station|guide)/iu,
  },
  {
    id: 'sleep',
    pattern: /(שינה|נדוד|עייפ|לישון|לילה|בוקר קשה|השכמה)/iu,
  },
  {
    id: 'nutrition',
    pattern: /(אוכל|אכיל|ארוח|מתוק|ערב|בולים|הרעב|תזונה|דיאט|משקל|חטיף)/iu,
  },
  {
    id: 'habits',
    pattern:
      /(הרגל|מים|אימון|הליכ|צעד|התמד|שגרה|כושר|ספורט|10 דק|מיקרו|משימה|יומי)/iu,
  },
  {
    id: 'emotions',
    pattern:
      /(רגש|עצב|חרד|לחץ|קשה|כועס|בדיד|תמיכה|מצב רוח|overwhelm|overwhelmed|דיכא|מתוסכל|בוכה|פחד)/iu,
  },
];

export function sessionTopicHaystack(
  session: InboxSession,
  title: string
): string {
  return [title, session.summary, session.preview_text].filter(Boolean).join(' ');
}

export function detectSessionTopic(
  session: InboxSession,
  title: string
): ChatTopicId {
  const chosen = session.topic as ChatTopicId | null | undefined;
  if (chosen && CHAT_TOPIC_ORDER.some((m) => m.id === chosen)) return chosen;
  const haystack = sessionTopicHaystack(session, title);
  for (const { id, pattern } of TOPIC_PATTERNS) {
    if (pattern.test(haystack)) return id;
  }
  return 'general';
}

export function groupSessionsByTopic(
  sessions: InboxSession[],
  titleForSession: (session: InboxSession) => string
): Array<{ id: ChatTopicId; label: string; accent: string; sessions: InboxSession[] }> {
  const buckets = new Map<ChatTopicId, InboxSession[]>();
  for (const meta of CHAT_TOPIC_ORDER) {
    buckets.set(meta.id, []);
  }

  for (const session of sessions) {
    const topic = detectSessionTopic(session, titleForSession(session));
    buckets.get(topic)?.push(session);
  }

  return CHAT_TOPIC_ORDER.map((meta) => ({
    id: meta.id,
    label: meta.label,
    accent: meta.accent,
    sessions: (buckets.get(meta.id) ?? []).sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    ),
  })).filter((section) => section.sessions.length > 0);
}

export function countSessionsByTopic(
  sessions: InboxSession[],
  titleForSession: (session: InboxSession) => string
): Map<ChatTopicId, number> {
  const counts = new Map<ChatTopicId, number>();
  for (const meta of CHAT_TOPIC_ORDER) {
    counts.set(meta.id, 0);
  }
  for (const session of sessions) {
    const topic = detectSessionTopic(session, titleForSession(session));
    counts.set(topic, (counts.get(topic) ?? 0) + 1);
  }
  return counts;
}
