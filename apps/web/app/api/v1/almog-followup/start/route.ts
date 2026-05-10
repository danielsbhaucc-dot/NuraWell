import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Client as WorkflowClient } from '@upstash/workflow';
import { readJsonBody } from '../../../../../lib/api/json-request';
import { requireApiSession } from '../../../../../lib/api/route-guards';
import { almogFollowupPayloadSchema } from '../../../../../lib/workflows/almog-followup-payload';
import { workflowPublicBaseUrl } from '../../../../../lib/workflows/resolve-workflow-public-url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const startBodySchema = z.object({
  taskId: z.string().min(1).max(200),
  delayString: z
    .string()
    .min(2)
    .regex(/^\d+[smhd]$/)
    .optional(),
});

/**
 * מתזמן workflow מעקב אחרי משימה (אחרי "מקובל עליי").
 * קוראים מהדפדפן רק אחרי התחברות — ה-QSTASH_TOKEN נשאר בשרת.
 */
export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = startBodySchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }

  const token = process.env.QSTASH_TOKEN?.trim();
  if (!token) {
    return NextResponse.json(
      { error: 'חסר QSTASH_TOKEN — ראה הסבר בהודעת הסיכום / תיעוד Upstash Workflow' },
      { status: 500 }
    );
  }

  const defaultDelay = (process.env.ALMOG_TASK_FOLLOWUP_DELAY ?? '24h').trim();
  let delayString = (parsed.data.delayString ?? defaultDelay).trim();

  const allowShort =
    process.env.NODE_ENV !== 'production' || process.env.ALMOG_FOLLOWUP_ALLOW_SHORT_DELAY === '1';

  if (!allowShort && /^\d+s$/.test(delayString)) {
    return NextResponse.json(
      { error: 'בפרודקשן השהייה בשניות חסומה. השתמש ב-m/h/d או הגדר ALMOG_FOLLOWUP_ALLOW_SHORT_DELAY=1 לבדיקות' },
      { status: 400 }
    );
  }

  const payload = almogFollowupPayloadSchema.parse({
    userId: auth.user.id,
    taskId: parsed.data.taskId,
    delayString,
  });

  const baseUrl = process.env.QSTASH_URL?.trim();
  const client = new WorkflowClient({
    token,
    ...(baseUrl ? { baseUrl } : {}),
  });

  const workflowUrl = `${workflowPublicBaseUrl()}/api/workflows/almog-followup`;

  const { workflowRunId } = await client.trigger({
    url: workflowUrl,
    body: JSON.stringify(payload),
    retries: 2,
    label: 'almog-task-followup',
  });

  return NextResponse.json({
    ok: true,
    workflowRunId,
    workflowUrl,
    delayString: payload.delayString,
  });
}
