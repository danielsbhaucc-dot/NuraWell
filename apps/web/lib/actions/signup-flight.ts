/**
 * One in-flight signup per email inside this server process.
 * A second call that arrives before the first returns shares that promise,
 * so it cannot create another user, GoTrue session, or parent grant.
 */
const flights = new Map<string, Promise<unknown>>();

export function beginSignupFlight<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = flights.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const promise = run().finally(() => {
    if (flights.get(key) === promise) flights.delete(key);
  });
  flights.set(key, promise);
  return promise;
}
