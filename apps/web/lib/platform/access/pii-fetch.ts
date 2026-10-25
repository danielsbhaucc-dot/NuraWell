'use client';
/**
 * fetch wrapper for screens that show a user's personal data. When the server answers
 * `pii_justification_required`, it asks the mounted <PiiJustificationHost/> for a reason, the host opens
 * a short grant on the server, and the request is retried once. Cancel → the original 403 response.
 */
export const PII_EVENT = 'nw:pii-justify';
export type PiiAsk = { subjectId: string; resolve: (granted: boolean) => void };

export async function piiFetch(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status !== 403 || typeof window === 'undefined') return res;
  const body = await res.clone().json().catch(() => null) as { code?: string; subjectId?: string } | null;
  if (body?.code !== 'pii_justification_required' || !body.subjectId) return res;
  const granted = await new Promise<boolean>((resolve) => {
    const ev = new CustomEvent<PiiAsk>(PII_EVENT, { detail: { subjectId: body.subjectId!, resolve } });
    if (!window.dispatchEvent(ev) || !(ev as unknown as { handled?: boolean }).handled) resolve(false);
  });
  return granted ? fetch(url, init) : res;
}
