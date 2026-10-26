import { gzipSync } from 'node:zlib';
/** Minimal ustar writer (regular files only) so packing needs no npm/CLI at request time. */
export function tarGz(files: { path: string; content: Buffer | string }[], mtime = 0): Buffer {
  const blocks: Buffer[] = [];
  for (const f of files) {
    const data = Buffer.isBuffer(f.content) ? f.content : Buffer.from(f.content, 'utf8');
    if (Buffer.byteLength(f.path) > 99) throw new Error(`path too long: ${f.path}`);
    const h = Buffer.alloc(512);
    h.write(f.path, 0, 'utf8');
    h.write('0000644\0', 100); h.write('0000000\0', 108); h.write('0000000\0', 116);
    h.write(data.length.toString(8).padStart(11, '0') + '\0', 124);
    h.write(Math.floor(mtime).toString(8).padStart(11, '0') + '\0', 136);
    h.write('        ', 148); h.write('0', 156); h.write('ustar\0', 257); h.write('00', 263);
    let sum = 0; for (const b of h) sum += b;
    h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
    blocks.push(h, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}
/** Reader for tests and the buyer-side integrity check. */
export function untar(buf: Buffer): { path: string; content: Buffer }[] {
  const out: { path: string; content: Buffer }[] = [];
  for (let o = 0; o + 512 <= buf.length; ) {
    const h = buf.subarray(o, o + 512);
    if (h.every((b) => b === 0)) break;
    const path = h.subarray(0, 100).toString('utf8').replace(/\0[\s\S]*$/, '');
    const size = parseInt(h.subarray(124, 136).toString().replace(/\0[\s\S]*$/, '').trim(), 8);
    out.push({ path, content: buf.subarray(o + 512, o + 512 + size) });
    o += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}
