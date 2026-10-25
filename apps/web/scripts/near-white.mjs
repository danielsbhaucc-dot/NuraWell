/**
 * Near-white detector shared by design-lint and its tests.
 * Flags: opaque white / white with alpha ≥ 0.6, hex/rgb/hsl/oklch with lightness > 96%,
 * Tailwind white-ish utilities (bg-white, bg-white/60+, bg-on-dark/60+, gradients ending in white),
 * inline style / CSS `white` keywords, and theme aliases whose value is near-white.
 */
export const LIGHTNESS_MAX = 96;
const pct = (v) => (String(v).trim().endsWith('%') ? parseFloat(v) / 100 : parseFloat(v));
const alphaOk = (a) => a === undefined || a === '' || pct(a) >= 0.6;
function hslL(r, g, b) { return ((Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255) * 100; }
export function hexLightness(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return { l: hslL(r, g, b), a };
}
export function findNearWhite(src, aliases = []) {
  const hits = [];
  const push = (m, why) => hits.push({ match: m, why });
  for (const m of src.matchAll(/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g)) {
    const { l, a } = hexLightness(m[0]);
    if (l > LIGHTNESS_MAX && a >= 0.6) push(m[0], `hex L=${l.toFixed(1)}%`);
  }
  for (const m of src.matchAll(/rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*(?:[,/]\s*([\d.]+%?))?\s*\)/g)) {
    if (hslL(+m[1], +m[2], +m[3]) > LIGHTNESS_MAX && alphaOk(m[4])) push(m[0], 'rgb near-white');
  }
  for (const m of src.matchAll(/hsla?\(\s*[\d.]+(?:deg)?[\s,]+[\d.]+%[\s,]+([\d.]+)%\s*(?:[,/]\s*([\d.]+%?))?\s*\)/g)) {
    if (+m[1] > LIGHTNESS_MAX && alphaOk(m[2])) push(m[0], 'hsl near-white');
  }
  for (const m of src.matchAll(/oklch\(\s*([\d.]+)(%?)\s+[\d.]+\s+[\d.]+\s*(?:\/\s*([\d.]+%?))?\s*\)/g)) {
    const L = m[2] ? +m[1] : +m[1] * 100;
    if (L > LIGHTNESS_MAX && alphaOk(m[3])) push(m[0], 'oklch near-white');
  }
  // Tailwind utilities
  for (const m of src.matchAll(/(?<![\w-])(bg|from|via|to|border|ring|fill|stroke|divide|outline)-white(?:\/(\d+))?(?![\w-])/g)) {
    if (m[2] === undefined || +m[2] >= 60 || m[1] !== 'bg') push(m[0], 'white utility');
  }
  for (const m of src.matchAll(/(?<![\w-])(bg|from|via|to)-on-dark(?:\/(\d+))?(?![\w-])/g)) {
    if (m[2] === undefined || +m[2] >= 60) push(m[0], 'on-dark is a text token, not a fill');
  }
  for (const m of src.matchAll(/(?:background(?:-color)?|backgroundColor|fill)\s*:\s*['"]?white\b|['"]white['"]|,\s*white\s*\)|linear-gradient\([^)]*\bwhite\b/g)) {
    push(m[0], 'white keyword');
  }
  for (const a of aliases) {
    const re = new RegExp(`(?<![\\w-])(bg|from|via|to)-${a}(?:\\/(\\d+))?(?![\\w-])`, 'g');
    for (const m of src.matchAll(re)) if (m[2] === undefined || +m[2] >= 60) push(m[0], `alias --color-${a} is near-white`);
  }
  return hits;
}
/** Theme tokens whose value is near-white (white alias tokens). */
export function nearWhiteAliases(css) {
  const out = [];
  for (const m of css.matchAll(/--color-([a-z0-9-]+):\s*([^;]+);/g)) {
    if (findNearWhite(m[2]).length || /^\s*white\s*$/i.test(m[2])) out.push(m[1]);
  }
  return out;
}
