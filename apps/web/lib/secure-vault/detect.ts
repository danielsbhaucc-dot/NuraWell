import { applyPiiDetectors, type PiiKind } from '@/lib/ai/privacy/pii-patterns';
import type { VaultKind } from './crypto-labels';

const MAP: Partial<Record<PiiKind, VaultKind>> = {
  ID: 'id', PASSPORT: 'passport', CARD: 'card', IBAN: 'bank', BANK_ACCOUNT: 'bank', ADDRESS: 'address', PHONE: 'phone',
};

/** Client-side: first vault-worthy identifier the user is typing in the open chat input (same detectors as the outbound guard). */
export function detectVaultCandidate(text: string): { kind: VaultKind; value: string } | null {
  if (!text || text.length < 6 || !/\d/.test(text)) return null;
  let hit: { kind: VaultKind; value: string } | null = null;
  applyPiiDetectors(text, (value, k) => {
    const kind = MAP[k];
    if (kind && !hit) hit = { kind, value };
    return value;
  });
  return hit;
}
