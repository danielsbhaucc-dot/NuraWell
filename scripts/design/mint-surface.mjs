/**
 * Mint / sage / cream light-surface detector (DESIGN_SYSTEM.md: neutral light surfaces, green only as accent).
 * A color is flagged when it is LIGHT (HSL L >= 75%), opaque-ish (alpha >= 0.35), and tinted:
 *  - mint/sage: G exceeds max(R,B) by >= 4, or
 *  - cream: R >= G >= B with R-B >= 14.
 * Pure neutrals (#dedee3, #f2f2f6, #e8e8ed, #cfd0d6) pass.
 */
export const LIGHT_MIN = 75;
const L = (r, g, b) => ((Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255) * 100;
export function isTintedLight(r, g, b, a = 1) {
  if (a < 0.35 || L(r, g, b) < LIGHT_MIN) return null;
  if (g - Math.max(r, b) >= 4) return 'mint';
  if (r >= g && g >= b && r - b >= 14) return 'cream';
  return null;
}
function hex(h) {
  h = h.replace('#', '');
  if (h.length <= 4) h = h.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1);
}
function oklchToRgb(l, c, hdeg) {
  const h = (hdeg * Math.PI) / 180, A = c * Math.cos(h), B = c * Math.sin(h);
  const l_ = l + 0.3963377774 * A + 0.2158037573 * B, m_ = l - 0.1055613458 * A - 0.0638541728 * B, s_ = l - 0.0894841775 * A - 1.291485548 * B;
  const [L3, M3, S3] = [l_ ** 3, m_ ** 3, s_ ** 3];
  const lin = [4.0767416621 * L3 - 3.3077115913 * M3 + 0.2309699292 * S3, -1.2684380046 * L3 + 2.6097574011 * M3 - 0.3413193965 * S3, -0.0041960863 * L3 - 0.7034186147 * M3 + 1.707614701 * S3];
  return lin.map((x) => Math.round(255 * Math.min(1, Math.max(0, x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055))));
}
/** Returns [{match, kind, index}] for every tinted light color literal in src. */
export function findMintSurfaces(src) {
  const hits = [];
  const add = (m, rgb, a) => { const k = isTintedLight(...rgb, a); if (k) hits.push({ match: m[0], kind: k, index: m.index }); };
  for (const m of src.matchAll(/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g)) { const [r, g, b, a] = hex(m[0]); add(m, [r, g, b], a); }
  for (const m of src.matchAll(/rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*(?:[,/]\s*([\d.]+%?))?\s*\)/g)) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]); add(m, [+m[1], +m[2], +m[3]], a);
  }
  for (const m of src.matchAll(/oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?))?\s*\)/g)) {
    const l = m[2] ? parseFloat(m[1]) / 100 : parseFloat(m[1]); const a = m[5] === undefined ? 1 : m[5].endsWith('%') ? parseFloat(m[5]) / 100 : parseFloat(m[5]);
    add(m, oklchToRgb(l, +m[3], +m[4]), a);
  }
  return hits;
}
/** Neutral replacement keeping roughly the same lightness. */
export function neutralFor(r, g, b) {
  const l = L(r, g, b);
  if (l >= 93) return [242, 242, 246];
  if (l >= 89) return [232, 232, 237];
  if (l >= 85) return [222, 222, 227];
  return [207, 208, 214];
}
export { hex as parseHex, oklchToRgb };
