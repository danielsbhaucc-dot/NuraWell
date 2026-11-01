import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');

describe('password error popup (no native dialogs)', () => {
  const dialog = read('components/auth/PasswordErrorDialog.tsx');
  const onboarding = read('components/onboarding/OnboardingFormClient.tsx');
  const rotation = read('components/ops-access/ForcePasswordRotation.tsx');
  const confirm = read('components/admin/ConfirmDialog.tsx');
  const animated = read('components/shared/AnimatedDialog.tsx');

  it('reuses the design-system ConfirmDialog in alert mode with "הבנתי"', () => {
    expect(dialog).toContain("from '@/components/admin/ConfirmDialog'");
    expect(dialog).toMatch(/\balert\b/);
    expect(dialog).toContain('confirmLabel="הבנתי"');
    expect(dialog).toContain('fieldRef?.current?.focus()');
  });

  it('alert dialogs expose role=alertdialog', () => {
    expect(confirm).toContain("role={alert ? 'alertdialog' : 'dialog'}");
    expect(animated).toContain('role={role}');
  });

  it('onboarding routes password errors to the popup and highlights the field', () => {
    expect(onboarding).toContain('<PasswordErrorDialog');
    expect(onboarding).toContain('result.fieldErrors?.password');
    expect(onboarding).toContain('aria-invalid={pwInvalid');
    expect(onboarding).not.toMatch(/minLength=\{12\}/);
  });

  it('ops rotation shows server password rejection in the popup, noValidate form', () => {
    expect(rotation).toContain('<PasswordErrorDialog');
    expect(rotation).toContain("j.field === 'password'");
    expect(rotation).toContain('<form noValidate');
  });

  it('no native alert/confirm/prompt/validity bubbles', () => {
    for (const src of [dialog, onboarding, rotation]) {
      expect(src).not.toMatch(/window\.(alert|confirm|prompt)\(|reportValidity\(|setCustomValidity\(/);
    }
  });
});
