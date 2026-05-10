import { z } from 'zod';
import { readJsonBody } from '../../../../../lib/api/json-request';
import { requireApiSession } from '../../../../../lib/api/route-guards';
import { ingestUserMessageIntoVectorMemory, previewVectorMemoryIngest } from '../../../../../lib/ai/vector-memory-ingest';

export const runtime = 'edge';

const bodySchema = z.object({
  message: z.string().min(1),
  /** אם true — מבצע upsert אמיתי ל-Upstash אחרי התצוגה המקדימה */
  write: z.boolean().optional(),
});

/**
 * בדיקת מסלול RAG: חילוץ (Llama Scout), מועמדים לאיחוד, שליפה סמנטית — ובחירה לכתיבה.
 * נדרש משתמש מחובר. אופציונלי: אם ב-Vercel מוגדר RAG_SELF_TEST_SECRET — חובה גם כותרת x-rag-self-test-secret תואמת (שכבת נעילה נוספת).
 */
export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const expectedSecret = process.env.RAG_SELF_TEST_SECRET?.trim();
  if (expectedSecret) {
    const secret = request.headers.get('x-rag-self-test-secret');
    if (secret !== expectedSecret) {
      return new Response(
        JSON.stringify({
          error: 'Forbidden',
          hint: 'Set header x-rag-self-test-secret to match RAG_SELF_TEST_SECRET, or remove that env var to allow signed-in users only.',
        }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        }
      );
    }
  }

  const rawBody = await readJsonBody(request);
  if (!rawBody.ok) return rawBody.response;

  const parsed = bodySchema.safeParse(rawBody.value);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Invalid body', details: parsed.error.flatten() }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  const { message, write } = parsed.data;

  const preview = await previewVectorMemoryIngest({
    userId: auth.user.id,
    userMessage: message,
  });

  let ingest_result: Awaited<ReturnType<typeof ingestUserMessageIntoVectorMemory>> | null = null;
  if (write) {
    ingest_result = await ingestUserMessageIntoVectorMemory({
      userId: auth.user.id,
      userMessage: message,
    });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      preview,
      ingest_result,
      wrote_to_upstash: Boolean(write),
    }),
    { headers: { 'Content-Type': 'application/json; charset=utf-8' } }
  );
}
