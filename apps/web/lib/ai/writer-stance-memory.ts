import type { ChatWriterKey } from './chat-writer-fleet';
import { isChatWriterKey } from './chat-writer-fleet';

export type ChatWriterStance = {
  writer: ChatWriterKey;
  reason: string;
  tags: string[];
  turns: number;
  updated_at: string;
};

const STICKY_MAX_TURNS = 5;
const STICKY_TTL_MS = 30 * 60 * 1000;

const RELEASE_RE =
  /^(?:תודה|תודה רבה|סבבה|אוקיי|היי|שלום|אהלן)[\s!.]*$/u;

/** המשך ברור לאותו עימות — לא כל הודעה קצרה. */
const CONTINUE_RE =
  /(?:^|\s)(?:כן אבל|לא אבל|עדיין|שוב|ומה|נו |ברצינות|בכל זאת|אותו דבר|כמו ש|אמרתי|תירוץ|שכחתי|אין לי כוח|תוכיח)/u;

function isStickyWriter(writer: ChatWriterKey): boolean {
  return writer === 'grok' || writer === 'claude5';
}

function hasConfrontationTags(tags: string[]): boolean {
  return tags.some((t) =>
    ['evasion', 'argument', 'accusation', 'direct', 'rude', 'people_please'].includes(t)
  );
}

function hasBoundaryTags(tags: string[]): boolean {
  return tags.some((t) => ['safety', 'boundaries', 'adult', 'warm_boundary'].includes(t));
}

export function parseChatWriterStance(raw: unknown): ChatWriterStance | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (!isChatWriterKey(typeof row.writer === 'string' ? row.writer : undefined)) return null;
  const writer = row.writer as ChatWriterKey;
  const reason = typeof row.reason === 'string' ? row.reason : writer;
  const tags = Array.isArray(row.tags)
    ? row.tags.filter((t): t is string => typeof t === 'string').slice(0, 12)
    : [];
  const turns = typeof row.turns === 'number' && Number.isFinite(row.turns) ? row.turns : 1;
  const updated_at = typeof row.updated_at === 'string' ? row.updated_at : '';
  if (!updated_at) return null;
  return { writer, reason, tags, turns, updated_at };
}

function stickyExpired(stance: ChatWriterStance, now: Date): boolean {
  const t = new Date(stance.updated_at).getTime();
  if (!Number.isFinite(t)) return true;
  return now.getTime() - t > STICKY_TTL_MS || stance.turns >= STICKY_MAX_TURNS;
}

/**
 * בכל הודעה בוחרים כותב מחדש לפי חוזקות.
 * Grok/Claude נדבקים רק אם התור *הנוכחי* עדיין בעימות/גבול,
 * או המשך קצר וברור לאותו קונפליקט — לא רק כי התור הקודם היה Grok.
 */
export function applyStickyWriterStance(opts: {
  turnWriter: ChatWriterKey;
  turnTags: string[];
  sticky: ChatWriterStance | null;
  userMessage: string;
  now?: Date;
}): { writer: ChatWriterKey; stance: ChatWriterStance | null; stickyApplied: boolean } {
  const now = opts.now ?? new Date();
  const t = opts.userMessage.replace(/\s+/g, ' ').trim();
  const tags = opts.turnTags;
  const safetyNow = hasBoundaryTags(tags) || opts.turnWriter === 'claude5';
  const grokNow = hasConfrontationTags(tags);

  // שחרור מפורש: תודה/ברכה, אמפתיה רכה, שגרה/תזונה.
  const releaseTopic =
    RELEASE_RE.test(t) ||
    tags.includes('coaching') ||
    tags.includes('simple') ||
    (tags.includes('empathy') && !grokNow && !safetyNow);

  if (safetyNow) {
    return {
      writer: 'claude5',
      stickyApplied: false,
      stance: {
        writer: 'claude5',
        reason: 'boundary',
        tags,
        turns: 1,
        updated_at: now.toISOString(),
      },
    };
  }

  // Grok רק כשיש תגיות עימות *בתור הזה* — לא רק כי turnWriter=======grok.
  if (grokNow) {
    const prevTurns =
      opts.sticky?.writer === 'grok' && !stickyExpired(opts.sticky, now) ? opts.sticky.turns : 0;
    return {
      writer: 'grok',
      stickyApplied: prevTurns > 0,
      stance: {
        writer: 'grok',
        reason: 'confrontation',
        tags,
        turns: prevTurns + 1,
        updated_at: now.toISOString(),
      },
    };
  }

  if (releaseTopic) {
    if (opts.turnWriter === 'llama4') {
      return { writer: 'llama4', stickyApplied: false, stance: null };
    }
    return { writer: 'terra', stickyApplied: false, stance: null };
  }

  const sticky = opts.sticky && !stickyExpired(opts.sticky, now) ? opts.sticky : null;
  if (sticky && isStickyWriter(sticky.writer)) {
    // המשך קצר לאותו עימות: רמז המשך + לא שאלה חדשה / לא נושא חדש.
    const clearSameConflict =
      CONTINUE_RE.test(t) &&
      t.length <= 90 &&
      !/[?？]/.test(t) &&
      !tags.includes('coaching') &&
      !tags.includes('empathy');
    if (clearSameConflict) {
      return {
        writer: sticky.writer,
        stickyApplied: true,
        stance: {
          ...sticky,
          turns: sticky.turns + 1,
          updated_at: now.toISOString(),
        },
      };
    }
  }

  if (opts.turnWriter === 'llama4') {
    return { writer: 'llama4', stickyApplied: false, stance: null };
  }

  // בלי תגיות עימות — גם אם המיזוג אמר grok, לא נועלים sticky.
  if (opts.turnWriter === 'grok' && !grokNow) {
    return { writer: 'terra', stickyApplied: false, stance: null };
  }

  return {
    writer: opts.turnWriter === 'claude5' ? 'terra' : opts.turnWriter,
    stickyApplied: false,
    stance: null,
  };
}
