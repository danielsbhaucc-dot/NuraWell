import { NextResponse } from 'next/server';

/** קריאת גוף JSON בצורה בטוחה (שגיאת תחביר → 400). */
export async function readJsonBody(
  request: Request
): Promise<{ ok: true; value: unknown } | { ok: false; response: NextResponse }> {
  try {
    const text = await request.text();
    if (!text.trim()) {
      return { ok: true, value: {} };
    }
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }),
    };
  }
}
