/**
 * מריץ עד `concurrency` משימות במקביל על מערך — שימושי ל-embeddings מהירים בלי להציף את ה-API.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const n = Math.max(1, Math.min(concurrency, items.length));
  const out: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!, i);
    }
  }

  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}
