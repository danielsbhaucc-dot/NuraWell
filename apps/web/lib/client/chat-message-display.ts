/**
 * חילוץ טקסט תצוגה בטוח מ-UIMessage (AI SDK v6) — ללא דליפת tool parts או פרוטוקול סטרימינג.
 */

import type { UIMessage } from 'ai';

/** חלקי הודעה מינימליים לחילוץ — תואם UIMessage.parts בלי לייבא כל ה-union. */
export type ChatMessageTextPart = {
  type: 'text';
  text?: string;
  state?: 'streaming' | 'done';
};

export type ChatMessagePart = ChatMessageTextPart | {
  type: string;
  text?: string;
  toolName?: string;
  state?: string;
  [key: string]: unknown;
};

export type ChatDisplayMessage = Pick<UIMessage, 'role'> & {
  parts?: ChatMessagePart[];
  /** שדה legacy — לא מועדף כשיש parts (UI message stream). */
  content?: string | null;
  toolInvocations?: unknown[];
};

const STREAM_PROTOCOL_LINE = /^\d+:/;
const STREAM_DATA_PREFIX = /^data:\s*/i;

const PROTOCOL_JSON_TYPES = new Set([
  'text-start',
  'text-end',
  'text-delta',
  'reasoning-start',
  'reasoning-end',
  'reasoning-delta',
  'tool-input-start',
  'tool-input-delta',
  'tool-input-end',
  'tool-output-available',
  'step-start',
  'start',
  'finish',
  'message-metadata',
]);

function isTextPart(part: ChatMessagePart): part is ChatMessageTextPart {
  return part.type === 'text';
}

function isToolOrNonDisplayPart(part: ChatMessagePart): boolean {
  const { type } = part;
  if (type === 'text') return false;
  if (type === 'reasoning' || type === 'step-start') return true;
  if (type === 'dynamic-tool') return true;
  if (type.startsWith('tool-')) return true;
  if (type.startsWith('data-')) return true;
  if (type === 'source-url' || type === 'source-document' || type === 'file') return true;
  return false;
}

function looksLikeStreamProtocolPayload(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (STREAM_PROTOCOL_LINE.test(trimmed)) return true;
  if (STREAM_DATA_PREFIX.test(trimmed)) {
    const body = trimmed.replace(STREAM_DATA_PREFIX, '').trim();
    return looksLikeStreamProtocolPayload(body);
  }
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as { type?: unknown };
      if (typeof parsed?.type === 'string') {
        if (PROTOCOL_JSON_TYPES.has(parsed.type)) return true;
        if (parsed.type.startsWith('tool-')) return true;
      }
    } catch {
      /* not JSON — treat as human text */
    }
  }
  if (/"type"\s*:\s*"(tool-|text-delta|reasoning-|step-start)/.test(trimmed)) {
    return true;
  }
  return false;
}

/**
 * מסיר שורות/קטעים שנראים כמו Data Stream Protocol שנדלפו לשדה content.
 */
export function stripStreamProtocolArtifacts(raw: string): string {
  if (!raw?.trim()) return '';

  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const kept: string[] = [];

  for (const line of lines) {
    if (looksLikeStreamProtocolPayload(line)) continue;
    kept.push(line);
  }

  return kept.join('\n').trim();
}

function textFromParts(parts: ChatMessagePart[]): string {
  return parts
    .filter(isTextPart)
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('')
    .trim();
}

/**
 * מחזיר רק טקסט אנושי להצגה בבועה — לעולם לא tool input/output או JSON של הסטרימינג.
 */
export function extractDisplayTextFromChatMessage(message: ChatDisplayMessage): string {
  const parts = Array.isArray(message.parts) ? message.parts : [];

  if (parts.length > 0) {
    const hasNonTextDisplayParts = parts.some(
      (part) => isToolOrNonDisplayPart(part) && !isTextPart(part)
    );
    const fromParts = textFromParts(parts);
    if (fromParts) return stripStreamProtocolArtifacts(fromParts);
    if (hasNonTextDisplayParts) return '';
  }

  if (typeof message.content === 'string' && message.content.trim()) {
    return stripStreamProtocolArtifacts(message.content.trim());
  }

  return '';
}

/** האם להודעת עוזר יש טקסט גלוי (לא רק tool parts). */
export function assistantMessageHasDisplayText(message: ChatDisplayMessage): boolean {
  if (message.role !== 'assistant') return false;
  return extractDisplayTextFromChatMessage(message).length > 0;
}

/** האם יש חלקי tool בלבד (ללא טקסט) — לא מציגים בועה. */
export function messageIsToolOnlyAssistant(message: ChatDisplayMessage): boolean {
  if (message.role !== 'assistant') return false;
  const parts = Array.isArray(message.parts) ? message.parts : [];
  if (!parts.length) return false;
  const hasText = parts.some((p) => isTextPart(p) && typeof p.text === 'string' && p.text.trim());
  const hasTool = parts.some((p) => isToolOrNonDisplayPart(p));
  return hasTool && !hasText;
}
