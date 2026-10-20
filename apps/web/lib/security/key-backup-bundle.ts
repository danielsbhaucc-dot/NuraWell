import { strToU8, zipSync } from 'fflate';
import { DR_HTML, GUIDE_HTML, RESTORE_HTML, SHARE_CARD_HTML } from './backup-docs.generated';

/**
 * The zip holds only things that are safe in a cloud folder (locked files + docs). The 3 shares are
 * NEVER zipped together: each is printed or saved separately so they end up in different places.
 * Browser-side: turns the server's ciphertext + shares into one zip with Hebrew printable docs. */
export type ClientBundle = {
  sealed: string;
  recovery: string;
  shares: [string, string, string];
  inventory: { name: string; fingerprint: string }[];
  createdAt: string;
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
export const WHERE = ['לכספת בבית', 'למנהל הסיסמאות', 'למעטפה סגורה אצל עורך הדין'] as const;
const LABEL: Record<string, string> = {
  PII_ENCRYPTION_KEY: 'מפתח פרטי המשתמשים',
  SECURE_VAULT_KEY: 'מפתח הכספת המאובטחת',
  GIDEON_SETTINGS_KEY: 'מפתח ההגדרות של גדעון',
  CONSENT_SIGNING_PRIVATE_KEY: 'מפתח החתימה על הסכמות',
};

export function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'long', timeStyle: 'short' }).format(new Date(iso));
}

export function renderGuide(b: Pick<ClientBundle, 'inventory' | 'createdAt'>) {
  const rows = `<tr><th>המפתח</th><th>שם טכני</th><th>טביעת אצבע</th></tr>${b.inventory
    .map((i) => `<tr><td>${esc(LABEL[i.name] ?? i.name)}</td><td><code>${esc(i.name)}</code></td><td><code>${esc(i.fingerprint)}</code></td></tr>`)
    .join('')}`;
  return GUIDE_HTML.replaceAll('{{DATE}}', esc(fmtDate(b.createdAt))).replace('{{INVENTORY}}', rows);
}

export function renderShareCard(share: string, n: 1 | 2 | 3, createdAt: string) {
  const pretty = esc(share).replace(/(.{24})/g, '$1 ').trim();
  return SHARE_CARD_HTML.replaceAll('{{N}}', String(n)).replaceAll('{{WHERE}}', `חלק ${n}: ${WHERE[n - 1]}`).replaceAll('{{DATE}}', esc(fmtDate(createdAt))).replace('{{SHARE}}', pretty);
}

export function buildZip(b: Omit<ClientBundle, 'shares'>): Uint8Array {
  const stamp = b.createdAt.slice(0, 10);
  const f: Record<string, Uint8Array> = {
    '00-מדריך-שחזור-קרא-אותי.html': strToU8(renderGuide(b)),
    'offline-restore.html': strToU8(RESTORE_HTML),
    '02-תוכנית-חירום.html': strToU8(DR_HTML.replaceAll('{{DATE}}', esc(fmtDate(b.createdAt)))),
    'keys.sealed.json': strToU8(b.sealed),
    'keys.recovery.json': strToU8(b.recovery),
  };
  return zipSync({ [`nurawell-key-backup-${stamp}`]: f }, { level: 6 });
}
