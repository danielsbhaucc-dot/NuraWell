'use client';

import type { ReactNode } from 'react';
import { AccessibilityProvider } from './AccessibilityProvider';
import { AccessibilityWidget } from './AccessibilityWidget';

export function AccessibilityToolbarClient({ children }: { children?: React.ReactNode }) {
  return (
    <AccessibilityProvider>
      {children}
      <AccessibilityWidget />
    </AccessibilityProvider>
  );
}
