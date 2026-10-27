// Public API of the "legal" module (re-export only; other modules import this, not the internal file).
export { ConsentEvidenceSheet, MAX_SHEET_SEGMENTS, captureSheet, expandForCapture } from '@/components/legal/ConsentEvidenceSheet';
export type { ConsentClientMeta, ConsentCollected } from '@/components/legal/ConsentEvidenceSheet';
