/**
 * Host selection = one config value. The same handler is wrapped for each host; nothing host-specific lives in the handler.
 *   cloudflare: `export default toHost('cloudflare', handler)`      (Workers: { fetch })
 *   vercel:     `export const POST = toHost('vercel', handler)`       (route handler; also GET for /health)
 *   node:       `toHost('node', handler).listen(8787)`                 (VPS; uses node:http only inside this adapter, loaded lazily)
 */
export type HostKind = 'cloudflare' | 'vercel' | 'node';
type Handler = (req: Request) => Promise<Response>;

export function toHost(kind: 'cloudflare', h: Handler): { fetch: Handler };
export function toHost(kind: 'vercel', h: Handler): Handler;
export function toHost(kind: 'node', h: Handler): { listen(port: number, host?: string): Promise<{ close(): void; port: number }> };
export function toHost(kind: HostKind, h: Handler): unknown {
  if (kind === 'cloudflare') return { fetch: (req: Request) => h(req) };
  if (kind === 'vercel') return h;
  if (kind === 'node') return { listen: (port: number, host = '127.0.0.1') => nodeListen(h, port, host) };
  throw new Error(`unknown host: ${String(kind)}`);
}

async function nodeListen(h: Handler, port: number, host: string) {
  const http = await import('node:http');
  const srv = http.createServer(async (req, res) => {
    const chunks: Buffer[] = []; let size = 0;
    for await (const c of req) { size += (c as Buffer).length; if (size > 64_000) { res.statusCode = 413; return res.end(); } chunks.push(c as Buffer); }
    const r = await h(new Request(`http://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`, { method: req.method, headers: req.headers as Record<string, string>, body: ['GET', 'HEAD'].includes(req.method ?? '') ? undefined : Buffer.concat(chunks) }));
    res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
  });
  await new Promise<void>((ok) => srv.listen(port, host, ok));
  const a = srv.address(); return { close: () => srv.close(), port: typeof a === 'object' && a ? a.port : port };
}
