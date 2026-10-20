'use client';

import { useCallback, useEffect, useState } from 'react';
import { ConsentEvidenceSheet } from './ConsentEvidenceSheet';
import type { ConsentAction, ConsentGender } from '@/lib/legal/consent-text';

export const CONSENT_OPEN_EVENT = 'nw:consent-sheet:open';
export const CONSENT_CHANGED_EVENT = 'nw:consent-sheet:changed';
type OpenDetail = { action: ConsentAction; source?: 'settings_privacy' | 'chat' | 'prompt' };

/** Opens the designed consent/withdrawal sheet from anywhere (chat button, settings, prompt). */
export function openConsentSheet(detail: OpenDetail) {
  window.dispatchEvent(new CustomEvent(CONSENT_OPEN_EVENT, { detail }));
}

const SNOOZE_KEY = 'nw.healthConsentPrompt.snoozedUntil';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

/** Single mounted host (dashboard layout). Also shows the one-time prompt for legacy accounts. */
export function ConsentSheetHost() {
  const [open, setOpen] = useState<OpenDetail | null>(null);
  const [gender, setGender] = useState<ConsentGender>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/v1/account/health-consent', { cache: 'no-store' });
    if (!r.ok) return null;
    const d = (await r.json()) as { gender?: ConsentGender; needs_prompt?: boolean };
    setGender(d.gender ?? null);
    return d;
  }, []);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<OpenDetail>).detail;
      void load().finally(() => setOpen(d));
    };
    window.addEventListener(CONSENT_OPEN_EVENT, onOpen);
    let snoozed = false;
    try {
      snoozed = Number(window.localStorage.getItem(SNOOZE_KEY) ?? 0) > Date.now();
    } catch {}
    if (!snoozed) void load().then((d) => d?.needs_prompt && setOpen({ action: 'grant', source: 'prompt' })).catch(() => {});
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, onOpen);
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const close = () => {
    if (open?.source === 'prompt') {
      try {
        window.localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
      } catch {}
    }
    setOpen(null);
  };

  return (
    <>
      <ConsentEvidenceSheet
        open={!!open}
        action={open?.action ?? 'grant'}
        gender={gender}
        source={open?.source}
        onClose={close}
        onDone={(r) => {
          const action = open?.action;
          setOpen(null);
          window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT, { detail: { active: r.active } }));
          setToast(action === 'withdraw' ? 'ההסכמה בוטלה והמידע הבריאותי נמחק' : 'ההסכמה נשמרה. תודה על האמון');
        }}
      />
      {toast ? (
        <div role="status" dir="rtl" className="fixed inset-x-0 bottom-24 z-[400] mx-auto w-fit max-w-[92vw] rounded-2xl border border-emerald-200 bg-glass/90 backdrop-blur-md px-4 py-3 text-sm font-semibold text-emerald-800 shadow-xl backdrop-blur">
          {toast}
        </div>
      ) : null}
    </>
  );
}
