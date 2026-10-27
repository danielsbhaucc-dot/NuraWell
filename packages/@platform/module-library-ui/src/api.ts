'use client';
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; stepUp?: boolean };
const NET = 'אין חיבור לשרת כרגע. נסו שוב בעוד רגע.';

/**
 * POST JSON. On a step-up 403 it asks the host (ops layout listens to `ops:stepup-required`) to verify,
 * then retries once and reports through the same callback. No native dialogs.
 */
export function postJson<T>(url: string, body: unknown, reason: string, done: (r: ApiResult<T>) => void, retried = false): void {
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' })
    .then(async (r) => {
      const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      if (r.status === 403 && j.stepUp && !retried) {
        done({ ok: false, error: 'נדרש אימות נוסף. אחרי האימות הפעולה תרוץ שוב.', stepUp: true });
        window.dispatchEvent(new CustomEvent('ops:stepup-required', { detail: { reason, purpose: typeof j.purpose === 'string' ? j.purpose : undefined, retry: () => postJson(url, body, reason, done, true) } }));
        return;
      }
      done(r.ok ? { ok: true, data: j as T } : { ok: false, error: typeof j.error === 'string' ? j.error : 'הפעולה נכשלה.' });
    })
    .catch(() => done({ ok: false, error: NET }));
}

export function downloadBase64(fileName: string, b64: string) {
  const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([u], { type: 'application/gzip' })); a.download = fileName; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
