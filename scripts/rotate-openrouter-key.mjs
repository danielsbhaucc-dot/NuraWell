#!/usr/bin/env node
// Rotate an OpenRouter API key into a Vercel project's env, never printing secret values.
//
// Usage:
//   OPENROUTER_MANAGEMENT_KEY=... VERCEL_TOKEN=... node scripts/rotate-openrouter-key.mjs \
//     --project <vercel-project-id> [--team <teamId>] [--env-name OPENROUTER_API_KEY] \
//     [--name <new-key-name>] [--limit <usd>] [--targets production,preview]
//   node scripts/rotate-openrouter-key.mjs --list
//   node scripts/rotate-openrouter-key.mjs --revoke <key-hash>   (only after a deploy using the new key is verified)
//
// Steps: create new key -> upsert Vercel env (sensitive) -> print the new key hash.
// It does not deploy and does not revoke the old key; revoke separately after verification.

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const has = (n) => args.includes(`--${n}`);

const OR = 'https://openrouter.ai/api/v1';
const mgmt = process.env.OPENROUTER_MANAGEMENT_KEY;
if (!mgmt) fail('OPENROUTER_MANAGEMENT_KEY is not set');

function fail(msg) { console.error(`error: ${msg}`); process.exit(1); }

async function or(path, init = {}) {
  const res = await fetch(`${OR}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${mgmt}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) fail(`OpenRouter ${path} -> HTTP ${res.status}`);
  return body;
}

async function list() {
  const { data = [] } = await or('/keys');
  for (const k of data) {
    console.log([k.name, k.hash, k.disabled ? 'disabled' : 'active', `usage=$${(k.usage ?? 0).toFixed(4)}`, `monthly=$${(k.usage_monthly ?? 0).toFixed(4)}`, `limit=${k.limit ?? 'none'}`].join('\t'));
  }
}

async function revoke(hash) {
  await or(`/keys/${encodeURIComponent(hash)}`, { method: 'DELETE' });
  console.log(`revoked ${hash}`);
}

async function rotate() {
  const vt = process.env.VERCEL_TOKEN;
  const project = opt('project');
  if (!vt) fail('VERCEL_TOKEN is not set');
  if (!project) fail('--project is required');
  const team = opt('team');
  const envName = opt('env-name', 'OPENROUTER_API_KEY');
  const targets = opt('targets', 'production,preview').split(',');
  const name = opt('name', `rotated-${new Date().toISOString().slice(0, 10)}`);
  const limit = opt('limit');

  const payload = { name };
  if (limit) payload.limit = Number(limit);
  const created = await or('/keys', { method: 'POST', body: JSON.stringify(payload) });
  const secret = created.key;
  if (!secret) fail('OpenRouter did not return a key');

  const q = team ? `?teamId=${encodeURIComponent(team)}` : '';
  const vh = { Authorization: `Bearer ${vt}`, 'Content-Type': 'application/json' };
  const res = await fetch(`https://api.vercel.com/v10/projects/${project}/env${q ? q + '&' : '?'}upsert=true`, {
    method: 'POST',
    headers: vh,
    body: JSON.stringify({ key: envName, value: secret, type: 'sensitive', target: targets }),
  });
  if (!res.ok) fail(`Vercel env upsert -> HTTP ${res.status} (new key hash ${created.data?.hash}; revoke it if unused)`);
  console.log(`created key "${name}" hash=${created.data?.hash} limit=${limit ?? 'none'}`);
  console.log(`set ${envName} for ${targets.join(',')} (sensitive). Next deploy picks it up; verify, then --revoke <old-hash>.`);
}

if (has('list')) await list();
else if (has('revoke')) await revoke(opt('revoke') || fail('--revoke needs a hash'));
else await rotate();
