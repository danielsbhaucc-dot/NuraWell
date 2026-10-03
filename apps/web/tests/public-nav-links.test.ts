import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  APP_HOME_PATH,
  MARKETING_PATHS_REDIRECT_WHEN_AUTHED,
  PUBLIC_HOME_PATH,
} from '@/lib/navigation/app-home-path';
import { LEGAL_NAV } from '@/components/legal/legal-nav';

const webRoot = resolve(__dirname, '..');

function readWeb(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), 'utf8');
}

describe('public / app navigation link contracts', () => {
  it('keeps public home and app home distinct', () => {
    expect(PUBLIC_HOME_PATH).toBe('/');
    expect(APP_HOME_PATH).toBe('/home');
    expect(PUBLIC_HOME_PATH).not.toBe(APP_HOME_PATH);
  });

  it('redirects authenticated users away from marketing landing paths', () => {
    expect(MARKETING_PATHS_REDIRECT_WHEN_AUTHED).toContain('/');
    expect(MARKETING_PATHS_REDIRECT_WHEN_AUTHED).toContain('/v2');
    expect(readWeb('middleware.ts')).toContain('MARKETING_PATHS_REDIRECT_WHEN_AUTHED');
  });

  it('wires home משימות shortcut as a button action, not href="#"', () => {
    const source = readWeb('components/home/QuickAccessGrid.tsx');
    expect(source).not.toMatch(/href:\s*['"]#['"]/);
    expect(source).toContain("kind: 'action'");
    expect(source).toContain('פתח את רשימת המשימות להיום');
    expect(readWeb('components/home/HomeClient.tsx')).toContain(
      'onOpenTasks={() => setTasksPopupOpen(true)}',
    );
  });

  it('sends SOS moments "חזרה לבית" to the app home, not marketing /', () => {
    const source = readWeb('components/settings/SosMomentsClient.tsx');
    expect(source).toContain('APP_HOME_PATH');
    expect(source).not.toMatch(/href=["']\/["']/);
  });

  it('keeps the public 404 page on guest-safe routes', () => {
    const source = readWeb('app/not-found.tsx');
    expect(source).toContain('PUBLIC_HOME_PATH');
    expect(source).toContain('href="/about"');
    expect(source).toContain('href="/contact"');
    expect(source).not.toContain('href="/home"');
    expect(source).not.toContain('href="/journey"');
    expect(source).not.toContain('חזרה למדריכים');
  });

  it('exposes about and contact in legal nav (middleware already allows them)', () => {
    const hrefs = LEGAL_NAV.map((item) => item.href);
    expect(hrefs).toContain('/about');
    expect(hrefs).toContain('/contact');
    expect(readWeb('middleware.ts')).toContain("'/about'");
    expect(readWeb('middleware.ts')).toContain("'/contact'");
  });
});
