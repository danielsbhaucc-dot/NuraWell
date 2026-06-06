import { AI_MODELS, groq, openrouter } from '@/lib/ai/client';

export const MAX_SOURCE_CHARS = 45_000;
const MAX_FETCH_CHARS = 80_000;

export type ResearchScanResult = {
  ai_summary: string;
  key_findings: string[];
  practical_takeaway: string;
  limitations: string;
  evidence_level: 'low' | 'moderate' | 'high' | 'unknown';
};

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export async function fetchResearchText(
  url: string
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
      'User-Agent': 'NuraWellResearchScanner/1.0',
    },
  });

  if (!res.ok) {
    return { ok: false, error: `לא הצלחתי לקרוא את הקישור (HTTP ${res.status}). הדבק Abstract/טקסט ידנית.` };
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (/application\/pdf|octet-stream/i.test(contentType) || /\.pdf($|\?)/i.test(url)) {
    return { ok: false, error: 'הקישור נראה כמו PDF. בשלב הזה הדבק Abstract או טקסט מרכזי ידנית לסריקה מדויקת וזולה.' };
  }

  const raw = (await res.text()).slice(0, MAX_FETCH_CHARS);
  const text = contentType.includes('html') ? stripHtml(raw) : raw.replace(/\s+/g, ' ').trim();
  if (text.length < 300) {
    return { ok: false, error: 'לא נמצא מספיק טקסט בקישור. הדבק Abstract/טקסט ידנית.' };
  }

  return { ok: true, text };
}

export function pickJsonObject(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

export function normalizeScanResult(value: unknown): ResearchScanResult {
  const obj = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const keyFindings = Array.isArray(obj.key_findings)
    ? obj.key_findings.map((x) => String(x).trim()).filter(Boolean).slice(0, 7)
    : [];
  const evidence = obj.evidence_level;

  return {
    ai_summary: String(obj.ai_summary ?? '').trim(),
    key_findings: keyFindings,
    practical_takeaway: String(obj.practical_takeaway ?? '').trim(),
    limitations: String(obj.limitations ?? '').trim(),
    evidence_level:
      evidence === 'low' || evidence === 'moderate' || evidence === 'high' || evidence === 'unknown'
        ? evidence
        : 'unknown',
  };
}

export async function runScannerLLM(params: {
  bibliographicContext: string;
  sourceText: string;
}): Promise<{ result: ResearchScanResult; model: string; provider: 'openrouter' | 'groq' }> {
  const system = `אתה מסכם מחקרים מדעיים עבור מנטור בריאות בשם אלמוג.
המשימה: להוציא מידע חיוני בלבד, בלי להמציא, בלי להפריז, ובלי המלצות רפואיות פרטניות.
החזר JSON תקין בלבד:
{
  "ai_summary": "סיכום בעברית ב-3-5 משפטים",
  "key_findings": ["3-7 ממצאים קצרים בעברית"],
  "practical_takeaway": "איך זה מתחבר לשיעור או להרגל בנורהוול",
  "limitations": "סייגים, מגבלות או 'לא צוין'",
  "evidence_level": "low|moderate|high|unknown"
}`;

  const user = `פרטי המחקר:
${params.bibliographicContext}

טקסט מקור:
${params.sourceText.slice(0, MAX_SOURCE_CHARS)}`;

  const openrouterModel = process.env.RESEARCH_SCAN_MODEL?.trim() || 'meta-llama/llama-4-scout';
  const groqModel = process.env.RESEARCH_SCAN_GROQ_MODEL?.trim() || AI_MODELS.background_groq;
  const groqEnabled = Boolean(process.env.GROQ_API_KEY?.trim());

  if (process.env.OPENROUTER_API_KEY?.trim()) {
    try {
      const completion = await openrouter.chat.completions.create({
        model: openrouterModel,
        temperature: 0.15,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      });
      const content = completion.choices[0]?.message?.content ?? '{}';
      return {
        result: normalizeScanResult(JSON.parse(pickJsonObject(content))),
        model: openrouterModel,
        provider: 'openrouter',
      };
    } catch (err) {
      if (!groqEnabled) throw err;
    }
  }

  if (!groqEnabled) {
    throw new Error('חסר OPENROUTER_API_KEY או GROQ_API_KEY לסריקת מחקרים');
  }

  const completion = await groq.chat.completions.create({
    model: groqModel,
    temperature: 0.1,
    max_tokens: 1000,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  const content = completion.choices[0]?.message?.content ?? '{}';
  return {
    result: normalizeScanResult(JSON.parse(pickJsonObject(content))),
    model: groqModel,
    provider: 'groq',
  };
}

export type ResearchScanInput = {
  title?: string;
  authors?: string;
  year?: string;
  journal?: string;
  finding?: string;
  url?: string | null;
  sourceText?: string;
};

export type ResearchScanSuccess = {
  ok: true;
  sourceKind: 'manual' | 'url';
  sourceText: string;
  model: string;
  provider: 'openrouter' | 'groq';
} & ResearchScanResult;

export type ResearchScanFailure = { ok: false; error: string; status: number };

function buildBibliographicContext(input: ResearchScanInput): string {
  return [
    input.title ? `Title: ${input.title}` : null,
    input.authors ? `Authors: ${input.authors}` : null,
    input.year ? `Year: ${input.year}` : null,
    input.journal ? `Journal: ${input.journal}` : null,
    input.finding ? `Existing finding: ${input.finding}` : null,
    input.url ? `URL: ${input.url}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * סורק מחקר יחיד: מחליט בין טקסט שהודבק ידנית לבין קריאה מקישור,
 * מחלץ טקסט, ומפעיל את ה-LLM לסיכום מלא לזיכרון. משותף בין מסלול
 * הסריקה הידנית לבין המילוי האוטומטי של צעד שלם.
 */
export async function scanResearchSource(
  input: ResearchScanInput
): Promise<ResearchScanSuccess | ResearchScanFailure> {
  const manualText = input.sourceText?.replace(/\s+/g, ' ').trim();
  let sourceText = manualText && manualText.length >= 80 ? manualText : '';
  let sourceKind: 'manual' | 'url' = sourceText ? 'manual' : 'url';

  if (!sourceText && input.url) {
    const fetched = await fetchResearchText(input.url);
    if (!fetched.ok) {
      return { ok: false, error: fetched.error, status: 422 };
    }
    sourceText = fetched.text;
    sourceKind = 'url';
  }

  if (!sourceText) {
    return { ok: false, error: 'צריך קישור נגיש או טקסט מקור לסריקה', status: 400 };
  }

  try {
    const { result, model, provider } = await runScannerLLM({
      bibliographicContext: buildBibliographicContext(input),
      sourceText,
    });

    if (!result.ai_summary || result.key_findings.length === 0) {
      return {
        ok: false,
        error: 'הסריקה לא החזירה מספיק מידע. נסה להדביק Abstract ברור יותר.',
        status: 502,
      };
    }

    return {
      ok: true,
      sourceKind,
      sourceText: sourceText.slice(0, MAX_SOURCE_CHARS),
      model,
      provider,
      ...result,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'שגיאת סריקה', status: 500 };
  }
}
