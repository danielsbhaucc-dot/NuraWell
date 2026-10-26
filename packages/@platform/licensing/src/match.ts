/** Pure (no Node APIs): shared by the Node library and the portable online verifier. */
export function hostMatches(host: string, pattern: string): boolean {
  const h = host.toLowerCase().replace(/:\d+$/, '');
  const p = pattern.toLowerCase();
  if (p.startsWith('*.')) { const rest = p.slice(2); return h.endsWith(`.${rest}`) && !h.slice(0, -rest.length - 1).includes('.'); }
  return h === p;
}

