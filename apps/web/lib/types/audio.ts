// טיפוסי מערכת האודיו — מוזיקת רקע לשיעורי המסע

/** קרדיט לרצועת אודיו (Pixabay וכו'). מוצג בשיעור בעיצוב זכוכית. */
export interface AudioCredit {
  /** מקור — לרוב "Pixabay" */
  source: string;
  /** שם היוצר/אמן */
  author: string;
  /** שם היצירה (אופציונלי) */
  title?: string | null;
  /** קישור למקור (אופציונלי) */
  link?: string | null;
  /** רישיון (אופציונלי), למשל "Pixabay Content License" */
  license?: string | null;
}

export interface AudioTrack {
  id: string;
  playlist_id: string;
  title: string;
  object_key: string;
  mime_type: string;
  duration_seconds: number | null;
  size_bytes: number | null;
  sort_order: number;
  credit: AudioCredit;
  created_at: string;
}

export interface AudioPlaylist {
  id: string;
  title: string;
  description: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface AudioPlaylistWithTracks extends AudioPlaylist {
  tracks: AudioTrack[];
}

/** סיכום פלייליסט לרשימות ניהול (כולל מספר רצועות). */
export interface AudioPlaylistSummary extends AudioPlaylist {
  track_count: number;
}

/** רצועה כפי שמועברת ל-StepLesson לצורך נגן הרקע. */
export interface LessonAudioTrack {
  id: string;
  title: string;
  url: string;
  credit: AudioCredit;
}
