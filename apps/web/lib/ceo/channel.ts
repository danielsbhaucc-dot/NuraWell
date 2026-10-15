/** Channel-agnostic outbound interface (Telegram today; WhatsApp etc. later implement the same shape). */
export type CeoButton = { text: string; data: string; url?: string };
export interface CeoChannel {
  readonly name: string;
  send(chatId: string, text: string, buttons?: CeoButton[][], opts?: { effect?: 'celebrate' }): Promise<void>;
  /** Acknowledge a button press and optionally replace the original message text (and keyboard). */
  ack(ref: { callbackId?: string; chatId: string; messageId?: number }, text?: string, buttons?: CeoButton[][]): Promise<void>;
  /** Optional niceties (best-effort, never throw). */
  typing?(chatId: string): Promise<void>;
  react?(chatId: string, messageId: number, emoji: string): Promise<void>;
}

/** Comma/space separated allowlist from env. Empty => nobody (fail closed). */
export function allowedChatIds(raw = process.env.CEO_TELEGRAM_ALLOWED_CHAT_IDS): Set<string> {
  return new Set((raw ?? '').split(/[\s,]+/).map((s) => s.trim()).filter(Boolean));
}

/**
 * Deep links into the admin panel. ops.nurawell.ai isn't connected yet, so the default is the
 * /ops path on the live app host (admin-gated). Set CEO_OPS_BASE_URL=https://ops.nurawell.ai once it is.
 */
export function opsLink(path: string): string {
  const base = (process.env.CEO_OPS_BASE_URL || 'https://nurawell.vercel.app/ops').trim().replace(/\/$/, '');
  const withProto = base.startsWith('http') ? base : `https://${base}`;
  return `${withProto}${path.startsWith('/') ? path : `/${path}`}`;
}
