/** Closed label shown when a finding summary cannot be opened. Never the stored value. */
export const CLOSED_FINDING = 'הממצא לא נפתח';

/** Plaintext, including an older short row, is shown. Ciphertext is not. */
export function findingTitle(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.startsWith('enc:')) return CLOSED_FINDING;
  return value;
}
