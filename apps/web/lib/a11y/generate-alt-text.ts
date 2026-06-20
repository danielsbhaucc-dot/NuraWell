import { openrouter } from '@/lib/ai/client';

const ALT_MODEL = process.env.AI_ALT_TEXT_MODEL?.trim() || 'openai/gpt-4o-mini';

export async function generateAltTextForImage(input: {
  imageUrl: string;
  title?: string | null;
  context?: string | null;
}): Promise<string> {
  const titleHint = input.title?.trim() ? `כותרת הקובץ: ${input.title.trim()}.` : '';
  const contextHint = input.context?.trim() ? `הקשר: ${input.context.trim()}.` : '';

  const completion = await openrouter.chat.completions.create({
    model: ALT_MODEL,
    temperature: 0.2,
    max_tokens: 180,
    messages: [
      {
        role: 'system',
        content:
          'אתה כותב טקסט חלופי (alt) קצר ומדויק בעברית לתמונות באתר בריאות ואורח חיים. ' +
          'הימנע מ"תמונה של" — תאר את התוכן המשמעותי בלבד. עד 120 תווים. החזר רק את הטקסט, ללא מרכאות.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `כתוב alt בעברית לתמונה זו. ${titleHint} ${contextHint}`.trim(),
          },
          {
            type: 'image_url',
            image_url: { url: input.imageUrl },
          },
        ],
      },
    ],
  });

  const alt = completion.choices[0]?.message?.content?.trim();
  if (!alt) throw new Error('לא התקבל טקסט חלופי מהמודל');
  return alt.slice(0, 500);
}
