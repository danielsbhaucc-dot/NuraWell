/**
 * מקביל ל-restore_pii_placeholders ב-DB (הטריגר לא יכול לעבוד על ciphertext).
 * שם פרטי חוזר במקום placeholders של שם; פרטי קשר וכל טוקן אחר נמחקים.
 */
export function restorePiiPlaceholders(text: string, firstName: string | null): string {
  if (!text || !text.includes('[')) return text;
  let out = text.replace(
    /\[\[?\s*(PERSON_NAME|USER_FIRST_NAME|USER_FULL_NAME|FIRST_NAME|FIRSTNAME|NAME|USER|שם)\s*\]\]?/gi,
    firstName ?? ''
  );
  out = out.replace(/\[\[?\s*(ADDRESS|USER_ADDRESS|USER_PHONE|PHONE|USER_EMAIL|EMAIL|USER_ID|כתובת)\s*\]\]?/gi, '');
  out = out.replace(/\[\[\s*[A-Z][A-Z0-9_]*\s*\]\]/g, '');
  out = out.replace(/[ \t]{2,}/g, ' ');
  out = out.replace(/ +([.,!?;:])/g, '$1');
  return out;
}

/** First name from a profiles.full_name value; never returns ciphertext (enc:...) as a name. */
export function firstNameFromFullName(fullName: unknown): string | null {
  if (typeof fullName !== 'string' || fullName.startsWith('enc:')) return null;
  return fullName.trim().split(/\s+/)[0] || null;
}
