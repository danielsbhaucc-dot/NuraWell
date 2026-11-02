'use client';

import type { ReactNode } from 'react';
import { AccessibilityProvider } from './AccessibilityProvider';
import { AccessibilityWidget } from './AccessibilityWidget';

/** `enabled` = central module state for 'a11y' (console toggle). Off → no widget; provider stays so children never break. */
// skipcq: JS-0067
export function AccessibilityToolbarClient({ children, enabled = true }: { children?: React.ReactNode; enabled?: boolean }) {
  return (
    <AccessibilityProvider>
      {children}
      {enabled ? <AccessibilityWidget /> : null}
    </AccessibilityProvider>
  );
}
