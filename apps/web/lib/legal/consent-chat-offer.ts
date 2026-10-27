/**
 * Chat reply for an explicit consent-change request: one calm, gender-matched explanation and a
 * structured action header (x-almog-consent-action) that makes the client show an inline button.
 * Nothing here changes consent.
 */
import { almogConsentReply, resolveConsentOffer } from './consent-chat-intent';
import type { ConsentAction } from './consent-text';
import { normalizeGender } from './consent-text';
import { isHealthChatMessage } from '@/lib/module-api/privacy-retention/lib-privacy-health-chat-redaction';

export const CONSENT_REQUEST_PLACEHOLDER = 'בקשה לעדכון ההסכמה למידע בריאותי';

type InsertRow = { user_id: string; session_id: string; role: 'user' | 'assistant'; content: string; metadata?: Record<string, unknown> };

export async function respondWithConsentOffer(p: {
  supabase: unknown;
  admin: { from: (t: string) => unknown };
  userId: string;
  sessionId: string;
  debugId: string;
  intent: ConsentAction | 'change';
  userText: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ensureSession: (sb: any, a: { sessionId: string; userId: string }) => Promise<unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  insert: (sb: any, row: InsertRow) => Promise<void>;
  statusLookup?: (userId: string) => Promise<string>;
}): Promise<Response> {
  let gender: 'female' | 'male' | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (p.admin.from('profiles') as any).select('gender').eq('id', p.userId).maybeSingle();
    gender = normalizeGender((data as { gender?: string } | null)?.gender);
  } catch {
    /* neutral wording */
  }
  let granted = false;
  try {
    const lookup = p.statusLookup ?? (async (id: string) => (await import('@/lib/module-api/privacy-retention/lib-privacy-health-consent')).healthConsentStatus(id));
    granted = (await lookup(p.userId)) === 'granted';
  } catch {
    granted = false;
  }
  const action = resolveConsentOffer(p.intent, granted);
  const already = action === 'grant' ? granted : !granted;
  const reply = almogConsentReply(action, gender, already);
  try {
    await p.ensureSession(p.supabase, { sessionId: p.sessionId, userId: p.userId });
    // the request text may itself contain health details; never store it in that case
    const userContent = isHealthChatMessage(p.userText.replace(/(הסכמ\S*|מידע\s*(?:ה)?בריאותי|בריאות\S*)/g, '')) ? CONSENT_REQUEST_PLACEHOLDER : p.userText;
    await p.insert(p.supabase, { user_id: p.userId, session_id: p.sessionId, role: 'user', content: userContent, metadata: { consent_request: true } });
    await p.insert(p.supabase, { user_id: p.userId, session_id: p.sessionId, role: 'assistant', content: reply, metadata: { consent_action: action } });
  } catch {
    console.warn('[ai/chat]', { debug_id: p.debugId, stage: 'consent_offer_persist_failed' });
  }
  return new Response(reply, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'x-session-id': p.sessionId,
      'x-debug-id': p.debugId,
      'x-ai-writer': 'consent-offer',
      'x-almog-consent-action': action,
    },
  });
}
