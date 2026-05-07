/**
 * Smoke-test: POST /api/v1/ai/chat and verify rows in ai_interactions (RLS as the user).
 *
 * Usage (from apps/web):
 *   node --env-file=.env.local scripts/test-ai-chat.mjs
 *
 * Required in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   OPENROUTER_API_KEY
 *   TEST_USER_EMAIL + TEST_USER_PASSWORD   (or set SUPABASE_ACCESS_TOKEN instead)
 *
 * Optional:
 *   TEST_CHAT_BASE_URL=http://localhost:3000
 *   TEST_CHAT_MESSAGE=היי אלמוג, איך אתה?
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const baseUrl = (process.env.TEST_CHAT_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const message = process.env.TEST_CHAT_MESSAGE || 'היי אלמוג, רק בודקים שהכול עובד. תגיד משהו קצר וחם.';

async function getAccessToken() {
  const existing = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (existing) return existing;

  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'Set SUPABASE_ACCESS_TOKEN or both TEST_USER_EMAIL and TEST_USER_PASSWORD in .env.local'
    );
  }

  const tokenUrl = `${supabaseUrl}/auth/v1/token?grant_type=password`;
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase sign-in failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  const token = data.access_token;
  if (!token) throw new Error('No access_token in Supabase response');
  return token;
}

async function main() {
  if (!supabaseUrl || !anonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  const accessToken = await getAccessToken();

  const chatRes = await fetch(`${baseUrl}/api/v1/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ message }),
  });

  const chatBodyText = await chatRes.text();
  let chatJson;
  try {
    chatJson = JSON.parse(chatBodyText);
  } catch {
    chatJson = null;
  }

  if (!chatRes.ok) {
    console.error('Chat API error:', chatRes.status, chatBodyText);
    process.exit(1);
  }

  console.log('Chat OK:', { session_id: chatJson?.session_id, reply_preview: (chatJson?.reply || '').slice(0, 200) });

  const rowsRes = await fetch(
    `${supabaseUrl}/rest/v1/ai_interactions?select=id,role,content,created_at&order=created_at.desc&limit=4`,
    {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!rowsRes.ok) {
    const t = await rowsRes.text();
    console.error('Could not verify DB (REST):', rowsRes.status, t);
    process.exit(1);
  }

  const rows = await rowsRes.json();
  const hasUser = rows.some((r) => r.role === 'user' && String(r.content).includes(message.slice(0, 15)));
  const hasAssistant = rows.some((r) => r.role === 'assistant' && r.content?.length > 0);

  console.log('Recent ai_interactions (newest first):', rows.map((r) => ({ role: r.role, id: r.id })));

  if (!hasAssistant) {
    console.error('Expected at least one assistant row in recent interactions.');
    process.exit(1);
  }

  if (!hasUser) {
    console.warn('Could not match user row by message snippet; check rows manually above.');
  }

  console.log('DB check: assistant row present — save path looks good.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
