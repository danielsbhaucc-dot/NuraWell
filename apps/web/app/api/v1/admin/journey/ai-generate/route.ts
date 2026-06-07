import { NextResponse } from 'next/server';
import { z } from 'zod';

import { AI_MODELS, groq, openrouter } from '@/lib/ai/client';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { readJsonBody } from '@/lib/api/json-request';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const bodySchema = z.object({
  /** תיאור חופשי של המסע הרצוי: נושא, אורך, קהל יעד וכו'. */
  prompt: z.string().min(10).max(4000),
  /** מספר תחנות מבוקש (ברירת מחדל: לפי שיקול המודל) */
  stations: z.number().int().min(1).max(12).optional(),
  /** מספר צעדים משוער לכל תחנה */
  stepsPerStation: z.number().int().min(1).max(12).optional(),
  /** אם true — לכתוב את התחנות והצעדים כטיוטה (is_published=false) */
  persist: z.boolean().optional(),
});

type BlueprintStep = {
  title: string;
  description: string;
  learning_objective: string;
  quiz_theme: string | null;
  commitment_idea: string | null;
};
type BlueprintStation = {
  title: string;
  description: string;
  steps: BlueprintStep[];
};
type JourneyBlueprint = {
  journey_title: string;
  journey_summary: string;
  stations: BlueprintStation[];
};

const SYSTEM_PROMPT = `אתה מתכנן תוכן בכיר ב-NuraWell — מומחה לליווי בריאות, הרגלים ושינוי התנהגותי. אתה בונה "מסע" שלם מתוך בקשה של מנהל.
מסע = רצף תחנות; כל תחנה = רצף צעדים (שיעורים). כל צעד מלמד רעיון אחד ומוביל לפעולה.

החזר JSON בלבד (בלי markdown):
{
  "journey_title": "שם המסע — קצר וקולע בעברית",
  "journey_summary": "2-3 משפטים שמתארים את המסע ואת מי שהוא משרת",
  "stations": [
    {
      "title": "שם התחנה",
      "description": "מה התחנה מלמדת — משפט-שניים",
      "steps": [
        {
          "title": "כותרת הצעד",
          "description": "תיאור קצר של הצעד",
          "learning_objective": "מה המשתמש ייקח מהצעד הזה — משפט אחד ממוקד",
          "quiz_theme": "נושא לשאלון קצר שמתאים לצעד (או null)",
          "commitment_idea": "רעיון להתחייבות קטנה וריאלית בסוף הצעד (או null)"
        }
      ]
    }
  ]
}

כללים:
- בעברית טבעית וחמה, בקול של NuraWell — אנושי, מעודד, מבוסס מדע אך לא יבש.
- בנה התקדמות הגיונית: מהבסיס למתקדם, כל תחנה נשענת על הקודמת.
- צעדים קונקרטיים וברי-ביצוע, לא כותרות מעורפלות.
- אם המנהל ציין מספר תחנות/צעדים — כבד אותו. אחרת בחר מספר סביר (3-6 תחנות, 3-5 צעדים לתחנה).
- אל תמציא מחקרים או ציטוטים מספריים — זה ימולא בשלב הבא.`;

function coerceBlueprint(raw: unknown): JourneyBlueprint | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const stationsRaw = Array.isArray(r.stations) ? r.stations : [];
  const stations: BlueprintStation[] = [];

  for (const s of stationsRaw) {
    if (!s || typeof s !== 'object') continue;
    const sr = s as Record<string, unknown>;
    const title = typeof sr.title === 'string' ? sr.title.trim() : '';
    if (!title) continue;
    const stepsRaw = Array.isArray(sr.steps) ? sr.steps : [];
    const steps: BlueprintStep[] = [];
    for (const st of stepsRaw) {
      if (!st || typeof st !== 'object') continue;
      const str = st as Record<string, unknown>;
      const stTitle = typeof str.title === 'string' ? str.title.trim() : '';
      if (!stTitle) continue;
      steps.push({
        title: stTitle.slice(0, 200),
        description: typeof str.description === 'string' ? str.description.trim().slice(0, 600) : '',
        learning_objective:
          typeof str.learning_objective === 'string' ? str.learning_objective.trim().slice(0, 400) : '',
        quiz_theme:
          typeof str.quiz_theme === 'string' && str.quiz_theme.trim() && str.quiz_theme.trim() !== 'null'
            ? str.quiz_theme.trim().slice(0, 200)
            : null,
        commitment_idea:
          typeof str.commitment_idea === 'string' &&
          str.commitment_idea.trim() &&
          str.commitment_idea.trim() !== 'null'
            ? str.commitment_idea.trim().slice(0, 300)
            : null,
      });
    }
    if (steps.length === 0) continue;
    stations.push({
      title: title.slice(0, 200),
      description: typeof sr.description === 'string' ? sr.description.trim().slice(0, 600) : '',
      steps,
    });
  }

  if (stations.length === 0) return null;
  return {
    journey_title: typeof r.journey_title === 'string' ? r.journey_title.trim().slice(0, 200) : 'מסע חדש',
    journey_summary: typeof r.journey_summary === 'string' ? r.journey_summary.trim().slice(0, 600) : '',
    stations,
  };
}

function pickJsonObject(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return '{}';
  return text.slice(start, end + 1);
}

async function generateBlueprint(userPrompt: string): Promise<JourneyBlueprint | null> {
  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    { role: 'user' as const, content: userPrompt },
  ];

  if (process.env.OPENROUTER_API_KEY?.trim()) {
    try {
      const completion = await openrouter.chat.completions.create({
        model: AI_MODELS.critical,
        temperature: 0.6,
        max_tokens: 8000,
        response_format: { type: 'json_object' },
        messages,
      });
      const bp = coerceBlueprint(JSON.parse(pickJsonObject(completion.choices[0]?.message?.content ?? '{}')));
      if (bp) return bp;
    } catch (error) {
      console.error('[journey/ai-generate] openrouter failed', error);
    }
  }

  if (process.env.GROQ_API_KEY?.trim()) {
    try {
      const completion = await groq.chat.completions.create({
        model: AI_MODELS.background_groq,
        temperature: 0.6,
        max_tokens: 8000,
        response_format: { type: 'json_object' },
        messages,
      });
      return coerceBlueprint(JSON.parse(pickJsonObject(completion.choices[0]?.message?.content ?? '{}')));
    } catch (error) {
      console.error('[journey/ai-generate] groq failed', error);
    }
  }

  return null;
}

/** כתיבת המסע כטיוטה: תחנות + צעדים (is_published=false). */
async function persistBlueprint(blueprint: JourneyBlueprint): Promise<{
  stationIds: string[];
  stepIds: string[];
}> {
  const admin = createAdminClient();
  const stationIds: string[] = [];
  const stepIds: string[] = [];

  // נקודת התחלה ל-sort_order ו-step_number כדי לא להתנגש בקיים.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lastStation } = await (admin as any)
    .from('journey_stations')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lastStep } = await (admin as any)
    .from('journey_steps')
    .select('step_number')
    .order('step_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  let sortOrder = (lastStation?.sort_order ?? 0) + 1;
  let stepNumber = (lastStep?.step_number ?? 0) + 1;

  for (const station of blueprint.stations) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: stationRow, error: stationErr } = await (admin as any)
      .from('journey_stations')
      .insert({
        title: station.title,
        description: station.description || null,
        sort_order: sortOrder,
      })
      .select('id')
      .single();

    if (stationErr || !stationRow) continue;
    stationIds.push(stationRow.id);
    sortOrder += 1;

    for (const step of station.steps) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: stepRow, error: stepErr } = await (admin as any)
        .from('journey_steps')
        .insert({
          station_id: stationRow.id,
          title: step.title,
          description: step.description || null,
          step_number: stepNumber,
          is_published: false,
          summary_text: step.learning_objective || null,
        })
        .select('id')
        .single();

      if (!stepErr && stepRow) {
        stepIds.push(stepRow.id);
      }
      stepNumber += 1;
    }
  }

  return { stationIds, stepIds };
}

export async function POST(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = bodySchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'צריך prompt (לפחות 10 תווים) לתיאור המסע', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { prompt, stations, stepsPerStation, persist } = parsed.data;
  const fullPrompt = [
    prompt,
    stations ? `מספר תחנות מבוקש: ${stations}` : null,
    stepsPerStation ? `מספר צעדים לכל תחנה: ${stepsPerStation}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const blueprint = await generateBlueprint(fullPrompt);
  if (!blueprint) {
    return NextResponse.json(
      { error: 'לא הצלחנו לייצר מסע. נסה לנסח את הבקשה אחרת.' },
      { status: 502 }
    );
  }

  if (!persist) {
    return NextResponse.json({ blueprint, persisted: false });
  }

  try {
    const { stationIds, stepIds } = await persistBlueprint(blueprint);
    return NextResponse.json({
      blueprint,
      persisted: true,
      created: { stations: stationIds.length, steps: stepIds.length },
      station_ids: stationIds,
      step_ids: stepIds,
    });
  } catch (error) {
    console.error('[journey/ai-generate] persist failed', error);
    return NextResponse.json({ blueprint, persisted: false, error: 'persist_failed' }, { status: 500 });
  }
}
