export type HistoryItemLike = { id: string; taskTitle: string; kind: string; fromLevel: number | null; toLevel: number | null; reason: string | null; at: string };

const dayKey = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date(iso));
const norm = (t: string) => t.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase();

/**
 * /plans history: collapse near-identical entries (same normalized task, same kind/direction, same day).
 * Up/down flips on the same day net out to one "changed" entry. Keeps the newest item, adds a count.
 */
export function collapseHistory<T extends HistoryItemLike>(items: T[]): Array<T & { count: number }> {
  const out: Array<T & { count: number }> = [];
  const index = new Map<string, number>();
  for (const h of items) {
    const dir = h.kind === 'level_change' ? 'level' : h.kind;
    const key = `${dayKey(h.at)}|${norm(h.taskTitle)}|${dir}`;
    const at = index.get(key);
    if (at == null) {
      index.set(key, out.length);
      out.push({ ...h, count: 1 });
    } else {
      out[at].count += 1;
    }
  }
  return out;
}
