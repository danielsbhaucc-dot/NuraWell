/** Case/space-insensitive substring match on a (decrypted) name; replaces SQL ilike on encrypted columns. */
export function nameMatches(name: string | null | undefined, query: string): boolean {
  if (!name) return false;
  const norm = (s: string) => s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
  const q = norm(query);
  return q.length > 0 && norm(name).includes(q);
}
