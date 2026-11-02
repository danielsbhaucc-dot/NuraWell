/** S5: asks the server whether the just-used password appears in known breaches. Fails open (false) on any error or after 2.5s. */
export const isPasswordLeaked = async (password: string): Promise<boolean> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch('/api/v1/auth/signin-password-check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }), signal: controller.signal });
    return res.ok && ((await res.json()) as { pwned?: boolean | null }).pwned === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
};
