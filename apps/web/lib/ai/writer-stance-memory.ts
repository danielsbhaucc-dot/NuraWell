import type { ChatWriterKey } from './chat-writer-fleet';
import { isChatWriterKey } from './chat-writer-fleet';

export type ChatWriterStance = {
  writer: ChatWriterKey;
  reason: string;
  tags: string[];
  turns: number;
  updated_at: string;
};

const STICKY_MAX_TURNS = 2;
const STICKY_TTL_MS = 15 * 60 * 1000;

const RELEASE_RE =
  /^(?:תודה|תודה רבה|סבבה|אוקיי|היי|שלום|אהלן)[\s!.]*$/u;

/** המשך ברור לאותו עימות — לא כל הודעה קצרה. */
const CONTINUE_RE =
  /(?:^|\s)(?:כן אבל|לא אבל|עדיין|שוב|ברצינות|בכל זאת|אותו דבר|תירוץ|תוכיח)/u;

function isStickyWriter(writer: ChatWriterKey): boolean {
  return writer === 'grok' || writer === 'claude5';
}

function hasBoundaryTags(tags: string[]): boolean {
  return tags.some((t) => ['safety', 'boundaries', 'adult', 'warm_boundary'].includes(t));
}

function hasHardConfrontationTags(tags: string[]): boolean {
  return tags.some((t) => ['accusation', 'argument', 'direct', 'rude', 'evasion'].includes(t));
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
 * ברירת מחדל: הכותב מהנתב/מיזוג כל תור מחדש.
 * Sticky קל בלבד (עד 2 תורים) להמשך עימות ברור — לא על תור רך.
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

  if (hasBoundaryTags(tags) || opts.turnWriter === 'claude5') {
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

  // שחרור: אמפתיה / אימון / תודה / נושא רך — תמיד לפי הנתב, בלי כלא Grok.
  const releaseTopic =
    RELEASE_RE.test(t) ||
    tags.includes('coaching') ||
    tags.includes('simple') ||
    (tags.includes('empathy') && !hasHardConfrontationTags(tags));

  if (releaseTopic) {
    return {
      writer: opts.turnWriter,
      stickyApplied: false,
      stance: null,
    };
  }

  const sticky = opts.sticky && !stickyExpired(opts.sticky, now) ? opts.sticky : null;
  const clearSameConflict =
    sticky &&
    isStickyWriter(sticky.writer) &&
    opts.turnWriter === 'terra' &&
    CONTINUE_RE.test(t) &&
    t.length <= 80 &&
    !/[?？]/.test(t) &&
    !tags.includes('coaching') &&
    !tags.includes('empathy');

  if (clearSameConflict && sticky) {
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

  const stance =
    opts.turnWriter === 'grok'
      ? {
          writer: 'grok' as const,
          reason: 'confrontation',
          tags,
          turns: 1,
          updated_at: now.toISOString(),
        }
      : null;

  return {
    writer: opts.turnWriter,
    stickyApplied: false,
    stance,
  };
}
