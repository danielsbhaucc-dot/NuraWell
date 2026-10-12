/** Channel-agnostic outbound interface (Telegram today; WhatsApp etc. later implement the same shape). */
export type CeoButton = { text: string; data: string };
export interface CeoChannel {
  readonly name: string;
  send(chatId: string, text: string, buttons?: CeoButton[][]): Promise<void>;
  /** Acknowledge a button press and optionally replace the original message text. */
  ack(ref: { callbackId?: string; chatId: string; messageId?: number }, text?: string): Promise<void>;
}

/** Comma/space separated allowlist from env. Empty => nobody (fail closed). */
export function allowedChatIds(raw = process.env.CEO_TELEGRAM_ALLOWED_CHAT_IDS): Set<string> {
  return new Set((raw ?? '').split(/[\s,]+/).map((s) => s.trim()).filter(Boolean));
}

/** Deep links into the admin panel. The ops host serves panel pages at the root (/errors, /users …). */
export function opsLink(path: string): string {
  const base = (process.env.CEO_OPS_BASE_URL || process.env.NEXT_PUBLIC_OPS_URL || 'https://ops.nurawell.ai').trim().replace(/\/$/, '');
  const withProto = base.startsWith('http') ? base : `https://${base}`;
  return `${withProto}${path.startsWith('/') ? path : `/${path}`}`;
}
