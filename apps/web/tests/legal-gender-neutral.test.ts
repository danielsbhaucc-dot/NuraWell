import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('legal body copy has no slash-gender forms', () => {
  for (const page of ['app/terms/page.tsx', 'app/safety/page.tsx']) {
    it(page, () => {
      const src = readFileSync(path.resolve(__dirname, '..', page), 'utf8');
      expect(src.match(/[\u05D0-\u05EA]+\/[\u05D0-\u05EA]+/g) ?? []).toEqual([]);
    });
  }
});
