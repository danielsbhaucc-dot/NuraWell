/** Split sanitized lesson HTML into slide-sized sections (by h2 or paragraph chunks). */
export interface LessonTextSection {
  heading: string | null;
  html: string;
}

export function splitLessonHtmlToSections(html: string): LessonTextSection[] {
  const trimmed = html.trim();
  if (!trimmed) return [];

  const hasH2 = /<h2[\s>]/i.test(trimmed);
  if (hasH2) {
    const parts = trimmed.split(/(?=<h2[\s>])/i).map((p) => p.trim()).filter(Boolean);
    return parts.map((part) => {
      const h2Match = part.match(/^<h2[^>]*>([\s\S]*?)<\/h2>/i);
      if (h2Match) {
        const heading = h2Match[1].replace(/<[^>]+>/g, '').trim() || null;
        const body = part.slice(h2Match[0].length).trim();
        return { heading, html: body || part };
      }
      return { heading: null, html: part };
    });
  }

  const paragraphs = trimmed.split(/(?=<\/p>)/i).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length <= 3) {
    return [{ heading: null, html: trimmed }];
  }

  const sections: LessonTextSection[] = [];
  const chunkSize = 3;
  for (let i = 0; i < paragraphs.length; i += chunkSize) {
    const chunk = paragraphs.slice(i, i + chunkSize).join('');
    sections.push({ heading: null, html: chunk });
  }
  return sections;
}
