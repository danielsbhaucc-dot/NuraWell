/**
 * Identity strip burned INTO the consent screenshot at capture time (client side, before the image is
 * hashed and signed), so who/when/where is covered by the signature. Minimal PII by design:
 * short user id, masked email, Israel time, device summary, consent version.
 */
export type IdentityStrip = { uid: string; email: string; at: string; device: string; version: string };

export function maskEmail(email: string | null | undefined): string {
  const e = (email ?? '').trim().toLowerCase();
  const at = e.indexOf('@');
  if (at < 1) return '—';
  const local = e.slice(0, at); const domain = e.slice(at + 1);
  return `${local.slice(0, Math.min(2, local.length))}***@${domain}`;
}
export const shortUid = (id: string | null | undefined) => (id ?? '').replace(/-/g, '').slice(0, 8) || '—';

export function deviceSummary(ua: string): string {
  const os = /iPhone|iPad/.test(ua) ? `iOS ${(/OS (\d+)[_.](\d+)/.exec(ua) ?? []).slice(1, 3).join('.')}`.trim()
    : /Android (\d+)/.test(ua) ? `Android ${/Android (\d+)/.exec(ua)![1]}`
    : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'מכשיר';
  const br = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'דפדפן';
  return `${os} · ${br}`.slice(0, 60);
}

export function israelTime(iso: string): string {
  return `${new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(iso)).replace(',', '')} IL`;
}

/** Returns a new canvas = strip on top + original below. Pure canvas drawing (no DOM text, no external fonts needed). */
export function drawIdentityStrip(src: HTMLCanvasElement, s: IdentityStrip): HTMLCanvasElement {
  const w = src.width;
  const k = w / 1080;
  const h = Math.round(150 * k);
  const out = document.createElement('canvas');
  out.width = w; out.height = src.height + h;
  const g = out.getContext('2d');
  if (!g) return src;
  const grad = g.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#0f3d36'); grad.addColorStop(1, '#14524a');
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  g.fillStyle = '#d4a64a'; g.fillRect(0, h - Math.max(2, Math.round(3 * k)), w, Math.max(2, Math.round(3 * k)));
  g.direction = 'rtl'; g.textAlign = 'right'; g.textBaseline = 'middle';
  const pad = Math.round(36 * k);
  g.fillStyle = '#cfd0d6'; g.font = `700 ${Math.round(30 * k)}px Rubik, Assistant, Arial, sans-serif`;
  g.fillText('צילום החלון ברגע האישור · NuraWell', w - pad, Math.round(40 * k));
  // Bidi-safe: every label / value is drawn as its own run, right to left, so Hebrew and Latin never reorder.
  const runs = (y: number, items: Array<[string | null, string]>, color: string, labelColor: string) => {
    let x = w - pad;
    g.font = `500 ${Math.round(24 * k)}px Assistant, Arial, sans-serif`;
    items.forEach(([label, value], idx) => {
      if (idx > 0) { g.fillStyle = '#d4a64a'; g.direction = 'ltr'; g.textAlign = 'right'; g.fillText('•', x, y); x -= g.measureText('•').width + 14 * k; }
      if (label) { g.fillStyle = labelColor; g.direction = 'rtl'; g.textAlign = 'right'; g.fillText(label, x, y); x -= g.measureText(label).width + 8 * k; }
      const rtl = /[\u0590-\u05FF]/.test(value) && !/^[\x00-\x7F]/.test(value);
      g.fillStyle = color; g.direction = rtl ? 'rtl' : 'ltr'; g.textAlign = 'right'; g.fillText(value, x, y); x -= g.measureText(value).width + 14 * k;
    });
  };
  runs(Math.round(84 * k), [['משתמש', s.uid], ['מייל', s.email], ['זמן', s.at]], '#f2f7f5', '#9cc7bd');
  runs(Math.round(120 * k), [['מכשיר', s.device], ['נוסח', s.version]], '#f2f2f6', '#9cc7bd');
  g.drawImage(src, 0, h);
  return out;
}
