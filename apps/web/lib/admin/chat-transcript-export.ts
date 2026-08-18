import type { ChatTranscriptTurn } from '@/lib/ai/chat-sessions/types';
import { formatTranscriptForLlm } from '@/lib/ai/chat-sessions/fetch-transcript';

function fmtHe(iso: string): string {
  try {
    return new Intl.DateTimeFormat('he-IL', {
      timeZone: 'Asia/Jerusalem',
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function buildTranscriptTxtExport(opts: {
  sessionTitle: string | null;
  sessionId: string;
  userId: string;
  turns: ChatTranscriptTurn[];
  exportedBy: string;
}): string {
  const header = [
    '=== NuraWell — תמליל שיחה (מוגן) ===',
    `מזהה שיחה: ${opts.sessionId}`,
    `משתמש: ${opts.userId}`,
    `כותרת: ${opts.sessionTitle?.trim() || 'ללא כותרת'}`,
    `יוצא על ידי: ${opts.exportedBy}`,
    `תאריך ייצוא: ${fmtHe(new Date().toISOString())}`,
    'שימוש פנימי בלבד — אסור להעביר ללא אישור המשתמש.',
    '=====================================',
    '',
  ].join('\n');

  const body = opts.turns
    .map((t) => {
      const who = t.role === 'user' ? 'משתמש' : 'אלמוג';
      return `[${fmtHe(t.created_at)}] ${who}:\n${t.content}`;
    })
    .join('\n\n');

  return `${header}${body}\n`;
}

export function buildTranscriptJsonExport(opts: {
  sessionTitle: string | null;
  sessionId: string;
  userId: string;
  turns: ChatTranscriptTurn[];
  exportedBy: string;
}): string {
  return JSON.stringify(
    {
      _meta: {
        format: 'nurawell-chat-transcript-v1',
        session_id: opts.sessionId,
        user_id: opts.userId,
        title: opts.sessionTitle,
        exported_at: new Date().toISOString(),
        exported_by_admin: opts.exportedBy,
        message_count: opts.turns.length,
        confidential: true,
      },
      messages: opts.turns.map((t) => ({
        role: t.role,
        content: t.content,
        created_at: t.created_at,
      })),
    },
    null,
    2,
  );
}

export function buildTranscriptShareSummary(opts: {
  sessionTitle: string | null;
  turns: ChatTranscriptTurn[];
  maxChars?: number;
}): string {
  const max = opts.maxChars ?? 1200;
  const formatted = formatTranscriptForLlm(opts.turns);
  if (formatted.length <= max) return formatted;
  return `${formatted.slice(0, max - 1)}…`;
}
