/**
 * access_audit_findings.signals is text[] of short enum codes (odd_hours, …), not free text.
 * Each element seals as enc:v2 under system:audit; array shape is preserved. UI decrypts via field-fetch.
 */
import { encryptValue } from '@/lib/security/field-crypto';
import { SYSTEM_ROW } from '@/lib/security/field-registry';

const OWNER = 'system:audit';
const CODE = /^[a-z0-9_]{2,40}$/;

export async function sealFindingSignals(signals: string[]): Promise<string[]> {
  if (!Array.isArray(signals) || signals.length === 0) return [];
  if (signals.every((s) => typeof s === 'string' && s.startsWith('enc:v2:'))) return signals;
  for (const s of signals) {
    if (typeof s !== 'string' || !CODE.test(s)) throw new Error('finding_signal_invalid');
  }
  const sealed = await encryptValue('access_audit_findings', 'signals', OWNER, SYSTEM_ROW, signals);
  if (!Array.isArray(sealed) || sealed.length !== signals.length || sealed.some((x) => typeof x !== 'string' || !x.startsWith('enc:v2:'))) {
    throw new Error('finding_signals_seal_failed');
  }
  return sealed as string[];
}

/** Legacy plaintext codes stay; ciphertext elements are omitted from display. */
export function readableFindingSignals(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === 'string' && x.length > 0 && !x.startsWith('enc:'));
}
