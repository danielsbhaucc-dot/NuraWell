import type { SupabaseClient } from '@supabase/supabase-js';

export type NotifyUserProfile = {
  firstName: string;
  genderInstruction: string;
};

/**
 * שם פרטי + הנחיית מגדר לפרומפטי נוטיפיקציה / אלמוג.
 */
export async function fetchNotifyUserProfile(
  admin: SupabaseClient,
  userId: string
): Promise<NotifyUserProfile> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await admin
    .from('profiles')
    .select('full_name, gender')
    .eq('id', userId)
    .maybeSingle();

  const row = (data ?? null) as { full_name?: string | null; gender?: string | null } | null;
  const full = (row?.full_name ?? '').trim();
  const firstName = full.split(/\s+/)[0]?.trim() || 'שם';

  const g = row?.gender;
  let genderInstruction =
    'מגדר לא ידוע — פנייה ניטרלית כשאפשר (למשל שם פרטי בלי לשון זכר/נקבה כפויה).';
  if (g === 'female') {
    genderInstruction =
      'המשתמשת נקבה — פנה בלשון נקבה (את, שלך, איתך, מוכנה) במשפט אחד–שניים.';
  } else if (g === 'male') {
    genderInstruction = 'המשתמש זכר — פנה בלשון זכר (אתה, שלך, איתך, מוכן) במשפט אחד–שניים.';
  } else if (g === 'other' || g === 'prefer_not_to_say') {
    genderInstruction =
      'מגדר לא מצוין או "אחר" — פנייה ניטרלית וחמה; העדף שם פרטי בלי לשון מוטה.';
  }

  return { firstName, genderInstruction };
}
