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

const CONTINUE_RE =
  /(?:^|\s)(?:כן אבל|לא אבל|עדיין|שוב|ומה|נו |ברצינות|בכל זאת|אותו דבר|כמו ש|אמרתי|תירוץ|שכחתי|אין לי כוח|תוכיח)/u;

function isStickyWriter(writer: ChatWriterKey): boolean {
  return writer === 'grok' || writer === 'claude5';
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
 * Grok/Claude נדבקים לכמה תורים אם זה אותו עימות/גבול, ומשוחררים כשהנושא מתחלף.
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
  const safetyNow = tags.includes('safety') || tags.includes('boundaries') || tags.includes('adult');
  const grokNow =
    tags.includes('evasion') ||
    tags.includes('argument') ||
    tags.includes('accusation') ||
    tags.includes('direct') ||
    tags.includes('rude') ||
    tags.includes('people_please');

  if (safetyNow || opts.turnWriter === 'claude5') {
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

  if (grokNow || opts.turnWriter === 'grok') {
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

  const sticky = opts.sticky && !stickyExpired(opts.sticky, now) ? opts.sticky : null;
  if (sticky && isStickyWriter(sticky.writer) && !RELEASE_RE.test(t)) {
    const shortFollowUp = t.length <= 90;
    const continues = CONTINUE_RE.test(t) || (shortFollowUp && !tags.includes('empathy'));
    const newCoaching = tags.includes('coaching') && !tags.includes('empathy');
    if (continues && !newCoaching) {
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

  return {
    writer: 'terra',
    stickyApplied: false,
    stance: null,
  };
}
