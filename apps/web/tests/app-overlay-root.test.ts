import { afterEach, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { APP_OVERLAY_ROOT_ID, getAppOverlayRoot } from '../lib/dom/app-overlay-root';

describe('getAppOverlayRoot', () => {
  const previousDocument = globalThis.document;

  afterEach(() => {
    if (previousDocument) {
      globalThis.document = previousDocument;
    } else {
      // @ts-expect-error restore node env without document
      delete globalThis.document;
    }
  });

  it('returns the phone-shell overlay host when present', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    globalThis.document = dom.window.document;
    const host = document.createElement('div');
    host.id = APP_OVERLAY_ROOT_ID;
    document.body.appendChild(host);
    expect(getAppOverlayRoot()).toBe(host);
  });

  it('falls back to document.body when the shell host is missing', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    globalThis.document = dom.window.document;
    expect(getAppOverlayRoot()).toBe(document.body);
  });
});
