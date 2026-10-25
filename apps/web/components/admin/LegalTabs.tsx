'use client';

import { LegalHub, type HubTab } from './hub/LegalHub';

/** Ops → משפטי: the unified rights & evidence hub (kept as LegalTabs for existing imports). */
export function LegalTabs({ initialTab = 'overview' }: { initialTab?: HubTab }) {
  return <LegalHub initialTab={initialTab as HubTab} />;
}
