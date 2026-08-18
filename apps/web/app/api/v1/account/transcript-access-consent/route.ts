import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { recordUserConsent } from '@/lib/privacy/record-consent';
import { CONSENT_TYPES } from '@/lib/privacy/constants';
import {
  notifyAdminTranscriptAccessApproved,
  notifyAdminTranscriptAccessDenied,
  notifyAllAdminsTranscriptConsentChange,
  resolveUserDisplayName,
} from '@/lib/admin/ops-admin-notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z
  .object({
    granted: z.boolean(),
  })
  .strict();

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('admin_transcript_access_at')
    .eq('id', user.id)
    .maybeSingle();

  const { data: consent } = await supabase
    .from('user_consents')
    .select('granted, created_at')
    .eq('user_id', user.id)
    .eq('consent_type', CONSENT_TYPES.adminTranscriptAccess)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const granted =
    Boolean(profile?.admin_transcript_access_at) || consent?.granted === true;

  const { data: pending } = await supabase
    .from('chat_transcript_access_requests')
    .select('id, session_id, reason, created_at, expires_at, admin_user_id')
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(10);

  return NextResponse.json({
    granted,
    granted_at: profile?.admin_transcript_access_at ?? null,
    pending_requests: pending ?? [],
  });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const { createAdminClient } = await import('@/lib/supabase/admin');
  const admin = createAdminClient();

  const { data: beforeProfile } = await admin
    .from('profiles')
    .select('admin_transcript_access_at')
    .eq('id', user.id)
    .maybeSingle();

  const wasGranted = Boolean(beforeProfile?.admin_transcript_access_at);

  const result = await recordUserConsent(admin, {
    userId: user.id,
    consentType: CONSENT_TYPES.adminTranscriptAccess,
    granted: parsed.data.granted,
    source: 'privacy_settings',
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  if (wasGranted !== parsed.data.granted) {
    const displayName = await resolveUserDisplayName(admin, user.id);
    await notifyAllAdminsTranscriptConsentChange(admin, {
      userId: user.id,
      userDisplayName: displayName,
      granted: parsed.data.granted,
    });
  }

  return NextResponse.json({ ok: true, granted: parsed.data.granted });
}

const resolveSchema = z
  .object({
    requestId: z.string().uuid(),
    approve: z.boolean(),
    denialReason: z.string().max(500).optional(),
  })
  .strict();

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = resolveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const { resolveTranscriptAccessRequest } = await import('@/lib/admin/chat-transcript-security');
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const admin = createAdminClient();

  const result = await resolveTranscriptAccessRequest(admin, {
    requestId: parsed.data.requestId,
    userId: user.id,
    approve: parsed.data.approve,
    userResponseNote: parsed.data.denialReason ?? null,
  });

  if (!result.ok) {
    const status =
      result.error === 'not_found' ? 404 : result.error === 'expired' ? 410 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  const displayName = await resolveUserDisplayName(admin, user.id);

  if (parsed.data.approve) {
    await notifyAdminTranscriptAccessApproved(admin, {
      adminUserId: result.adminUserId,
      userId: user.id,
      userDisplayName: displayName,
      sessionId: result.sessionId,
      requestId: result.requestId,
    });
  } else {
    await notifyAdminTranscriptAccessDenied(admin, {
      adminUserId: result.adminUserId,
      userId: user.id,
      userDisplayName: displayName,
      sessionId: result.sessionId,
      requestId: result.requestId,
      userNote: parsed.data.denialReason ?? null,
    });
  }

  return NextResponse.json({ ok: true, approved: parsed.data.approve });
}
