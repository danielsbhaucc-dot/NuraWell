import { NextResponse } from 'next/server';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { readJsonBody } from '@/lib/api/json-request';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import {
  aiFillSchema,
  enrichResearchesFromLinks,
  ensureMinimums,
  extractUrls,
  mergeUrlsIntoResearches,
  runFillLLM,
} from '@/lib/admin/journey-agent/fill-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 120, windowSeconds: 60 },
    { limit: 1000, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = aiFillSchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'צריך טקסט מקור (לפחות 40 תווים) למילוי אוטומטי' },
      { status: 400 }
    );
  }

  const sourceText = parsed.data.sourceText.trim();
  const clarificationAnswers = parsed.data.clarificationAnswers;
  const analysisSummary = parsed.data.analysisSummary;

  // תגובת NDJSON זורמת — כל שורה היא אירוע מצב אמיתי (phase) שהקליינט מציג כפס התקדמות.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
        } catch {
          /* הזרם נסגר על ידי הלקוח */
        }
      };

      try {
        send({ phase: 'analyze' });

        const { result, model, provider } = await runFillLLM(sourceText, {
          clarificationAnswers,
          analysisSummary,
        });

        // השלמה ליעדי המינימום (3 שאלות הבנה, 3 טענות משחק, 4 נקודות קשב) —
        // מעבר ממוקד אחד שמייצר רק את החסר, כדי שהצעד תמיד יהיה עשיר.
        await ensureMinimums(sourceText, result, { clarificationAnswers, analysisSummary });

        // זיהוי דטרמיניסטי של כל הקישורים בטקסט — כך שרשימת קישורים שלמה
        // הופכת לרשימת מחקרים מלאה (ולא רק הקישור שה-LLM הזכיר).
        const urls = extractUrls(sourceText);
        result.researches = mergeUrlsIntoResearches(result.researches, urls);

        if (!result.title) {
          if (result.researches.length) {
            result.title = 'מחקרים — לעריכה';
          } else {
            send({ phase: 'error', error: 'ה-AI לא הצליח להפיק תוכן מהטקסט. נסה טקסט ארוך/ברור יותר.' });
            controller.close();
            return;
          }
        }

        const toScanCount = result.researches.filter(
          (r) => r.url && /^https?:\/\//i.test(r.url)
        ).length;

        send({
          phase: 'generated',
          model,
          provider,
          detected_links: urls.length,
          researches: result.researches.length,
          research_to_scan: Math.min(toScanCount, 15),
        });

        const enriched = await enrichResearchesFromLinks(result.researches, (processed, total) => {
          send({ phase: 'research', processed, total });
        });
        result.researches = enriched.researches;

        send({
          phase: 'done',
          provider,
          model,
          step: result,
          research_scan: {
            detected_links: urls.length,
            researches: result.researches.length,
            scanned: enriched.scanned,
            errors: enriched.scanErrors,
          },
        });
        controller.close();
      } catch (e) {
        send({ phase: 'error', error: e instanceof Error ? e.message : 'שגיאה במילוי אוטומטי' });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
