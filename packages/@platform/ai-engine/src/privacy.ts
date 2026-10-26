import type { ChatMessage, PrivacyGuard } from './types';

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(?:\+?972[-\s]?|0)(?:[23489]|5\d|7\d)[-\s]?\d{3}[-\s]?\d{4}\b/g;
const ISRAELI_ID = /\b\d{9}\b/g;
const CARD = /\b(?:\d[ -]?){13,19}\b/g;

/** Baseline guard: strips emails, Israeli phones, 9-digit IDs and card-like numbers. Fail-safe default. */
export const baselinePrivacyGuard: PrivacyGuard = (messages: ChatMessage[]) =>
  messages.map((m) => ({
    ...m,
    content: m.content
      .replace(EMAIL, '[email]')
      .replace(CARD, '[number]')
      .replace(PHONE, '[phone]')
      .replace(ISRAELI_ID, '[id]'),
  }));
