import { describe, expect, it } from 'vitest';
import { LANDING_V2_HTML } from '../app/landing-v2/landing-html';

describe('landing-v2 public page', () => {
  it('contains no internal placeholder markers', () => {
    expect(LANDING_V2_HTML).not.toMatch(/\[להשלמה|\[לאמת/);
    expect(LANDING_V2_HTML).not.toMatch(/class="ph"/);
  });
  it('is marked noindex', () => {
    expect(LANDING_V2_HTML).toContain('name="robots" content="noindex, nofollow"');
  });
});
