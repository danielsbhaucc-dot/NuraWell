export type GuideAccessType = 'trial' | 'full';
export type GuideGrantedBy = 'admin' | 'ai' | 'self' | 'schedule';
export type GuideVisibility = 'hidden' | 'discoverable';

export interface GuideEnrollmentRow {
  id?: string;
  user_id?: string;
  course_id?: string;
  is_active: boolean;
  access_type?: GuideAccessType | null;
  trial_ends_at?: string | null;
  granted_by?: GuideGrantedBy | null;
  granted_reason?: string | null;
  enrolled_at?: string | null;
}

export interface GuideCourseRow {
  id: string;
  title: string;
  description?: string | null;
  thumbnail_url?: string | null;
  background_image_key?: string | null;
  is_published?: boolean | null;
  is_premium?: boolean | null;
  unlock_at?: string | null;
  visibility?: GuideVisibility | null;
  sort_order?: number | null;
}

/** האם המדריך פורסם ופתוח לפי תאריך. */
export function isGuideUnlocked(course: Pick<GuideCourseRow, 'is_published' | 'unlock_at'>): boolean {
  if (course.is_published === false) return false;
  if (!course.unlock_at) return true;
  return new Date(course.unlock_at).getTime() <= Date.now();
}

/** האם הרישום פעיל ולא פג תוקף. */
export function isEnrollmentActive(enrollment: GuideEnrollmentRow | null | undefined): boolean {
  if (!enrollment?.is_active) return false;
  if (enrollment.access_type === 'trial' && enrollment.trial_ends_at) {
    return new Date(enrollment.trial_ends_at).getTime() > Date.now();
  }
  return true;
}

/** האם למשתמש יש גישה למדריך (רישום פעיל + מדריך פתוח). */
export function canAccessGuide(
  course: GuideCourseRow,
  enrollment: GuideEnrollmentRow | null | undefined
): boolean {
  if (!isGuideUnlocked(course)) return false;
  return isEnrollmentActive(enrollment);
}

/** האם המדריך צריך להופיע ברשימה (גישה פעילה או discoverable + פתוח). */
export function shouldListGuide(
  course: GuideCourseRow,
  enrollment: GuideEnrollmentRow | null | undefined
): boolean {
  if (canAccessGuide(course, enrollment)) return true;
  if (course.visibility === 'hidden') return false;
  return isGuideUnlocked(course) && !!enrollment?.is_active;
}

/** ימים לניסיון לפי סוג אות. */
export const TRIAL_DAYS_BY_SIGNAL: Record<string, number> = {
  shabbat: 14,
  holidays: 7,
  stress: 10,
  default: 7,
};
