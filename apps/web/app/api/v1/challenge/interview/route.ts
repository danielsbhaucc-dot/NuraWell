import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBody } from '@/lib/api/json-request';
import { requireApiSession } from '@/lib/api/route-guards';
import { getUserEnrollment } from '@/lib/challenge/enrollment';
import { runChallengeInterviewTurn } from '@/lib/challenge/interview-llm';
import type { ChallengeInterviewTurn } from '@/lib/challenge/content';
import { embedTextForRag } from '@/lib/ai/openrouter-embeddings';
import { isUpstashVectorConfigured, upsertUserMemoryVector } from '@/lib/ai/upstash-vector-rest';
import { createHash } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 45;

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(4000),
      }),
    )
    .max(30)
    .optional(),
});

async function ingestInterviewInsights(userId: string, insights: Record<string, unknown>) {
  if (!isUpstashVectorConfigured()) return;
  const text = Object.entries(insights)
    .filter(([, v]) => v && String(v).trim())
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join('\n');
  if (!text.trim()) return;

  const vec = await embedTextForRag(text);
  const id = createHash('sha256').update(`challenge-interview:${userId}`).digest('hex').slice(0, 32);
  await upsertUserMemoryVector({
    id,
    vector: vec,
    metadata: {
      userId,
      text,
      category: 'Challenges',
      updatedAt: new Date().toISOString(),
      memoryLevel: 4,
      isInsight: true,
      schema: 'challenge_interview_v1',
    },
  });
}

export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const enrollment = await getUserEnrollment(auth.supabase, auth.user.id);
  if (!enrollment) {
    return NextResponse.json({ error: 'Not enrolled' }, { status: 404 });
  }

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = bodySchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const messages: ChallengeInterviewTurn[] = parsed.data.messages ?? [];

  const { data: profile } = await auth.supabase
    .from('profiles')
    .select('full_name, gender')
    .eq('id', auth.user.id)
    .single();

  const firstName = (profile?.full_name as string | null)?.trim().split(/\s+/)[0] ?? 'חבר/ה';
  const gender = (profile?.gender as 'male' | 'female' | null) ?? null;

  const result = await runChallengeInterviewTurn({ messages, firstName, gender });

  const transcript = [
    ...messages,
    ...(result.reply ? [{ role: 'assistant' as const, content: result.reply }] : []),
  ];

  if (result.done) {
    const insights = result.insights ?? {};
    const now = new Date().toISOString();

    await auth.supabase.from('challenge_interview_sessions').upsert(
      {
        enrollment_id: enrollment.id,
        user_id: auth.user.id,
        transcript,
        extracted_insights: insights,
        completed_at: now,
        updated_at: now,
      },
      { onConflict: 'enrollment_id' },
    );

    await auth.supabase
      .from('challenge_enrollments')
      .update({ interview_completed_at: now, status: 'active', updated_at: now })
      .eq('id', enrollment.id);

    await auth.supabase.from('challenge_success_events').insert({
      enrollment_id: enrollment.id,
      user_id: auth.user.id,
      event_type: 'interview_complete',
      title: 'סיימת את הריאיון עם אלמוג',
      description: 'עכשיו אני מכיר/ה אותך יותר טוב — ואזהה את ההצלחות שלך.',
      detected_by: 'rule',
      evidence: { insights },
    });

    ingestInterviewInsights(auth.user.id, insights as Record<string, unknown>).catch(() => {});
  } else {
    await auth.supabase.from('challenge_interview_sessions').upsert(
      {
        enrollment_id: enrollment.id,
        user_id: auth.user.id,
        transcript,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'enrollment_id' },
    );
  }

  return NextResponse.json({
    reply: result.reply,
    done: result.done,
    insights: result.insights,
  });
}
