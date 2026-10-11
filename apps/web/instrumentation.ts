/** Next.js hook: every unhandled server error (route handlers, pages, server actions) → error_events (free tracking). */
export async function register() {}

export async function onRequestError(
  err: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string; routeType: string }
) {
  const { reportError } = await import('./lib/monitoring/report-error');
  await reportError(err, {
    source: context.routePath,
    tags: { route: request.path.split('?')[0].slice(0, 200), method: request.method, kind: context.routeType },
  });
}
