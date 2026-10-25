import { describe, expect, it, vi } from 'vitest';
import { passwordPolicyError, rotatePasswordWithCode, rotationExempt } from '@/lib/ops/password-rotation';
import { emergencyCardLines, emergencyCardText, emergencyCardHtml } from '@/lib/ops/emergency-card';

type State = { recovery_failures: number; recovery_locked_until: string | null; password_rotation_required: boolean };
function fakeDb(state: State, validCode: string) {
  const used = new Set<string>();
  const db = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ...state }, error: null }) }) }),
      update: (patch: Partial<State>) => ({ eq: async () => { Object.assign(state, patch); return { error: null }; } }),
    }),
    rpc: async (_: string, a: { p_code: string }) => {
      const n = a.p_code.toUpperCase().replace(/-/g, '');
      if (n === validCode && !used.has(n)) { used.add(n); return { data: true }; }
      return { data: false };
    },
  };
  return db as never;
}
const GOOD = 'Str0ng-Passw0rd!';
const deps = () => ({ setPassword: vi.fn(async () => ({ error: null })), audit: vi.fn(async () => undefined), alert: vi.fn(async () => undefined) });

describe('break-glass password rotation', () => {
  it('exempts only the device, step-up and rotation routes', () => {
    expect(rotationExempt('/api/v1/ops/device')).toBe(true);
    expect(rotationExempt('/api/v1/ops/stepup/begin')).toBe(true);
    expect(rotationExempt('/api/v1/ops/security/rotate-password')).toBe(true);
    expect(rotationExempt('/api/v1/ops/iam/products')).toBe(false);
    expect(rotationExempt('/api/v1/ops/devicex')).toBe(false);
    expect(rotationExempt('/api/v1/admin/users')).toBe(false);
  });
  it('enforces a strong password', () => {
    expect(passwordPolicyError('short1!A')).not.toBeNull();
    expect(passwordPolicyError('alllowercaseletters')).not.toBeNull();
    expect(passwordPolicyError(GOOD)).toBeNull();
  });
  it('requires a valid recovery code; success sets password, clears flag, audits and alerts', async () => {
    const st: State = { recovery_failures: 0, recovery_locked_until: null, password_rotation_required: true };
    const db = fakeDb(st, 'ABCDE12345');
    const d = deps();
    const bad = await rotatePasswordWithCode(db, 'u', 'ZZZZZ-99999', GOOD, d);
    expect(bad.ok).toBe(false);
    expect(d.setPassword).not.toHaveBeenCalled();
    expect(st.password_rotation_required).toBe(true);
    const ok = await rotatePasswordWithCode(db, 'u', 'abcde-12345', GOOD, d);
    expect(ok.ok).toBe(true);
    expect(d.setPassword).toHaveBeenCalledWith('u', GOOD);
    expect(st.password_rotation_required).toBe(false);
    expect(d.alert).toHaveBeenCalledTimes(1);
    expect(d.audit).toHaveBeenCalledWith('ops_password_rotated_after_break_glass', {});
  });
  it('a code works once', async () => {
    const st: State = { recovery_failures: 0, recovery_locked_until: null, password_rotation_required: true };
    const db = fakeDb(st, 'ABCDE12345');
    expect((await rotatePasswordWithCode(db, 'u', 'ABCDE12345', GOOD, deps())).ok).toBe(true);
    st.password_rotation_required = true;
    expect((await rotatePasswordWithCode(db, 'u', 'ABCDE12345', GOOD, deps())).ok).toBe(false);
  });
  it('locks after 5 failures and refuses even a valid code while locked', async () => {
    const st: State = { recovery_failures: 0, recovery_locked_until: null, password_rotation_required: true };
    const db = fakeDb(st, 'ABCDE12345');
    let last;
    for (let i = 0; i < 5; i++) last = await rotatePasswordWithCode(db, 'u', 'WRONG00000', GOOD, deps());
    expect(last).toMatchObject({ ok: false, status: 429 });
    const d = deps();
    expect(await rotatePasswordWithCode(db, 'u', 'ABCDE12345', GOOD, d)).toMatchObject({ ok: false, status: 429 });
    expect(d.setPassword).not.toHaveBeenCalled();
  });
  it('weak password never burns a code', async () => {
    const st: State = { recovery_failures: 0, recovery_locked_until: null, password_rotation_required: true };
    const db = fakeDb(st, 'ABCDE12345');
    expect((await rotatePasswordWithCode(db, 'u', 'ABCDE12345', 'weak', deps())).ok).toBe(false);
    expect((await rotatePasswordWithCode(db, 'u', 'ABCDE12345', GOOD, deps())).ok).toBe(true);
  });
});

describe('emergency card', () => {
  const codes = Array.from({ length: 10 }, (_, i) => `AAAAA-${String(i).padStart(5, '0')}`);
  it('has exactly 10 numbered lines', () => {
    expect(emergencyCardLines(codes)).toHaveLength(10);
    expect(emergencyCardLines(codes)[9]).toBe('10. AAAAA-00009');
    expect(() => emergencyCardLines(codes.slice(0, 9))).toThrow();
    expect(emergencyCardText(codes, new Date(0)).split('\n').filter((l) => /^\d\d\. /.test(l))).toHaveLength(10);
    expect((emergencyCardHtml(codes, new Date(0)).match(/<li>/g) ?? []).length).toBe(10);
  });
});
