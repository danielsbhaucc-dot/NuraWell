import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';

/**
 * One signup attempt in its own process. The parent test starts two of these
 * against the same Postgres and the same GoTrue. Email is not the lock.
 */
const [mode, nonce, sub, email] = process.argv.slice(2);
const db = process.env.SIGNUP_ONCE_DB;
const port = process.env.SIGNUP_ONCE_PORT;
const secret = process.env.SIGNUP_ONCE_JWT;
const base = `http://127.0.0.1:${port}`;

function psql(sql) {
  return execFileSync('sudo', ['-n', '-u', 'postgres', 'psql', '-d', db, '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql], {
    encoding: 'utf8',
  }).trim().split('\n').pop() ?? '';
}

function jwt() {
  const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ role: 'service_role', iss: 'supabase', iat: now, exp: now + 600 });
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

function begin() {
  return psql(`select public.parent_signup_begin('${nonce}', '${sub}', '${email}')`);
}

function attemptOf(word) {
  return word.startsWith('claimed:') ? word.slice('claimed:'.length) : '';
}

async function admin(path, body) {
  const token = jwt();
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, apikey: token, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = {};
  try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = {}; }
  return { status: response.status, parsed };
}

async function mint(userId, finish, attempt) {
  const linked = userId
    ? await admin('/admin/generate_link', { type: 'magiclink', email })
    : await (async () => {
      const created = await admin('/admin/users', { email, password: 'Oncepass12345', email_confirm: true });
      if (created.status !== 200 || !created.parsed?.id) return { created: created.status, linked: 0, verified: 0 };
      const noted = psql(`select public.parent_signup_note_user('${nonce}', '${attempt}', '${created.parsed.id}')`);
      if (noted !== 't') return { created: created.status, linked: 0, verified: 0 };
      return { created: 200, id: created.parsed.id, ...(await admin('/admin/generate_link', { type: 'magiclink', email })) };
    })();
  if (linked.created && linked.created !== 200) return linked;
  const linkStatus = linked.status ?? linked.created;
  const hash = linked.parsed?.hashed_token;
  if (!hash) return { created: linked.created ?? 200, linked: linkStatus, verified: 0 };
  const token = jwt();
  const verified = await fetch(`${base}/verify`, {
    method: 'POST',
    headers: { apikey: token, 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', token_hash: hash }),
  });
  const session = await verified.json();
  const id = userId || linked.id || psql(`select id::text from auth.users where email = '${email}'`);
  const sessionId = psql(`select id::text from auth.sessions where user_id = '${id}' order by created_at desc limit 1`);
  const issued = psql(`select public.parent_session_issue('${id}', '${sessionId}', '${sub}') is not null`);
  const finished = finish ? psql(`select public.parent_signup_finish('${nonce}', '${attempt}', '${id}', '${sessionId}')`) : 'open';
  return {
    created: linked.created ?? 200,
    linked: linkStatus,
    verified: verified.status,
    issued,
    finished,
    access: session.access_token ?? '',
    sessionId,
    userId: id,
  };
}

const word = begin();
const attempt = attemptOf(word);
if (mode === 'race') {
  if (!attempt) {
    process.stdout.write(word);
  } else {
    const minted = await mint(null, true, attempt);
    process.stdout.write(minted.finished === 't' && minted.verified === 200 && minted.issued === 't' ? 'minted' : 'mint-failed');
  }
} else if (mode === 'late' || mode === 'mismatch') {
  process.stdout.write(word.startsWith('claimed:') ? 'claimed' : word);
} else if (mode === 'foreign') {
  if (!attempt) {
    process.stdout.write(word);
  } else {
    const created = await admin('/admin/users', { email, password: 'Oncepass12345', email_confirm: true });
    psql(`select public.parent_signup_fail('${nonce}', '${attempt}', null)`);
    process.stdout.write(created.status === 200 ? 'leaked' : 'blocked');
  }
} else if (mode === 'fail') {
  if (!attempt) {
    process.stdout.write(word);
  } else {
    const first = await mint(null, false, attempt);
    const aborted = psql(`select public.parent_signup_fail('${nonce}', '${attempt}', '${first.sessionId}')`);
    const left = psql(`select count(*)::text from auth.sessions where user_id = '${first.userId}'`);
    const again = begin();
    const nextAttempt = attemptOf(again);
    const known = nextAttempt ? psql(`select public.parent_signup_user('${nonce}', '${nextAttempt}')`) : '';
    const second = nextAttempt && known === first.userId ? await mint(known, true, nextAttempt) : { finished: 'f', sessionId: '' };
    const stale = psql(`select public.parent_signup_fail('${nonce}', '${attempt}', '${second.sessionId || first.sessionId}')`);
    const kept = psql(`select count(*)::text from auth.sessions where id = '${second.sessionId}'`);
    process.stdout.write([
      aborted === 't' ? 'aborted' : 'abort-failed',
      left,
      again.startsWith('claimed:') ? 'claimed' : again,
      second.finished === 't' ? 'retried' : 'retry-failed',
      stale === 'f' && kept === '1' ? 'fenced' : 'leaked',
    ].join(' '));
  }
} else {
  process.stdout.write('bad-mode');
}
