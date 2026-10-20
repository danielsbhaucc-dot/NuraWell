// Receives mail routed by Cloudflare Email Routing (receipts@nurawell.ai) and forwards the raw
// RFC 822 bytes to the app, HMAC-SHA256 signed. Rejects oversized mail. No storage, no state.
const MAX = 10 * 1024 * 1024;

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, data);
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async email(message, env) {
    if (message.rawSize > MAX) { message.setReject('Message too large'); return; }
    const raw = new Uint8Array(await new Response(message.raw).arrayBuffer());
    const ts = String(Math.floor(Date.now() / 1000));
    const from = message.from || '';
    const prefix = new TextEncoder().encode(`${ts}.${from}.`);
    const signed = new Uint8Array(prefix.length + raw.length);
    signed.set(prefix); signed.set(raw, prefix.length);
    const sig = await hmac(env.RECEIPTS_INBOUND_SECRET, signed);
    const res = await fetch(env.APP_INBOUND_URL, {
      method: 'POST',
      headers: { 'content-type': 'message/rfc822', 'x-nw-ts': ts, 'x-nw-envelope-from': from, 'x-nw-signature': sig },
      body: raw,
    });
    if (res.status === 403) message.setReject('Sender not allowed');
    else if (!res.ok) throw new Error(`app ${res.status}`); // Cloudflare retries / bounces temporarily
  },
};
