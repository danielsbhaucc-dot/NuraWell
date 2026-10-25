import { __resetFieldCrypto, setDekStoreForTests, type DekStore } from '@/lib/security/field-crypto';
import type { WrappedDek } from '@/lib/security/field-envelope';

/** In-memory per-user DEK store so enc:v2 writers/readers run in unit tests without a database. */
export function useMemDekStore(): void {
  const rows = new Map<string, WrappedDek>();
  const store: DekStore = {
    async get(u) { return rows.get(u) ?? null; },
    async putIfAbsent(u, w) { if (!rows.has(u)) rows.set(u, w); return rows.get(u)!; },
  };
  __resetFieldCrypto();
  setDekStoreForTests(store);
}
