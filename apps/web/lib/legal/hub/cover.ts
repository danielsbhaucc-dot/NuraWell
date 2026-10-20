/** Extracts embedded cover art (ID3v2.3/2.4 APIC) from an MP3. Pure; returns null when absent. */
export function id3Cover(buf: Uint8Array): { mime: string; bytes: Uint8Array } | null {
  if (buf.length < 10 || buf[0] !== 0x49 || buf[1] !== 0x44 || buf[2] !== 0x33) return null;
  const ver = buf[3]!;
  const syncsafe = (o: number) => ((buf[o]! & 0x7f) << 21) | ((buf[o + 1]! & 0x7f) << 14) | ((buf[o + 2]! & 0x7f) << 7) | (buf[o + 3]! & 0x7f);
  const end = Math.min(buf.length, 10 + syncsafe(6));
  let p = 10;
  while (p + 10 <= end) {
    const id = String.fromCharCode(buf[p]!, buf[p + 1]!, buf[p + 2]!, buf[p + 3]!);
    const size = ver === 4 ? syncsafe(p + 4) : (buf[p + 4]! << 24) | (buf[p + 5]! << 16) | (buf[p + 6]! << 8) | buf[p + 7]!;
    if (!/^[A-Z0-9]{4}$/.test(id) || size <= 0) break;
    if (id === 'APIC') {
      const f = buf.subarray(p + 10, p + 10 + size);
      const enc = f[0]!; let i = 1;
      let mime = ''; while (i < f.length && f[i] !== 0) mime += String.fromCharCode(f[i++]!);
      i += 2; // NUL + picture type
      if (enc === 1 || enc === 2) { while (i + 1 < f.length && !(f[i] === 0 && f[i + 1] === 0)) i += 2; i += 2; } else { while (i < f.length && f[i] !== 0) i++; i++; }
      const bytes = f.subarray(i);
      const m = /png/i.test(mime) ? 'image/png' : 'image/jpeg';
      return bytes.length > 100 ? { mime: m, bytes } : null;
    }
    p += 10 + size;
  }
  return null;
}
