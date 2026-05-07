/**
 * NuraWell - Course System Types
 * AI-Ready: All types are explicit and descriptive for AI consumption
 */

export interface LessonMeta {
  id: string;
}

export interface CourseWithProgress {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  is_premium: boolean;
  lessons: LessonMeta[];
  progress: number;
  isEnrolled: boolean;
}

export interface LessonTask {
  id: string;
  title: string;
  description?: string;
  is_required: boolean;
}

export interface LessonHabit {
  id: string;
  title: string;
  emoji?: string;
  frequency: 'daily' | 'weekly';
}

export interface MediaFile {
  id: string;
  lesson_id: string;
  file_type: 'audio' | 'pdf' | 'presentation' | 'video_url' | 'image';
  uploadthing_url: string | null;
  uploadthing_name: string | null;
  uploadthing_size: number | null;
  video_provider: 'bunny' | 'heygen' | 'youtube' | 'vimeo' | 'custom' | null;
  video_external_id: string | null;
  video_external_url: string | null;
  duration_seconds: number | null;
  mime_type: string | null;
  sort_order: number;
}

export interface LessonDetail {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  lesson_type: 'video' | 'audio' | 'text' | 'pdf' | 'presentation' | 'mixed';
  text_content: string | null;
  external_links: ExternalLink[];
  tasks: LessonTask[];
  habits: LessonHabit[];
  sort_order: number;
  duration_minutes: number | null;
  media_files: MediaFile[];
  course: {
    id: string;
    title: string;
  };
}

export interface ExternalLink {
  id: string;
  label: string;
  url: string;
  icon?: string;
}

export interface LessonProgressData {
  lesson_id: string;
  is_completed: boolean;
  task_progress: Record<string, boolean>;
  habit_progress: Record<string, boolean[]>;
  time_spent_seconds: number;
}

export interface CourseDetail {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  is_premium: boolean;
  lessons: {
    id: string;
    title: string;
    description: string | null;
    lesson_type: LessonDetail['lesson_type'];
    sort_order: number;
    duration_minutes: number | null;
    is_completed?: boolean;
  }[];
  progress: number;
  isEnrolled: boolean;
}

export interface UserStats {
  totalLessonsCompleted: number;
  activeCoursesCount: number;
  avgProgress: number;
  currentStreak?: number;
}
