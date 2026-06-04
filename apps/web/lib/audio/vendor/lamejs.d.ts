// Type declarations for the vendored ESM build of @breezystack/lamejs (lamejs.js).
// Vendored to avoid an npm dependency (offline, no runtime network).
export class Mp3Encoder {
  constructor(channels: number, sampleRate: number, kbps: number);
  encodeBuffer(left: Int16Array, right?: Int16Array): Int8Array;
  flush(): Int8Array;
}

export class WavHeader {
  constructor();
  RIFF: number;
  WAVE: number;
  fmt_: number;
  data: number;
  readHeader: (buffer: ArrayBuffer | DataView) => void;
  toBuffer(): ArrayBuffer;
}

declare const _default: {
  Mp3Encoder: typeof Mp3Encoder;
  WavHeader: typeof WavHeader;
};
export default _default;
